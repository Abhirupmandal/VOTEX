"""Anomaly detection for the AI Election Guardian.

Two complementary detectors run over each window's features:

* **Detector A — statistical.** Robust, explainable thresholding driven by the
  rolling baseline: a velocity z-score and relative deviation checks for
  inter-arrival compression, temporal burst concentration, wallet concentration,
  candidate-distribution collapse, and gas dispersion. Z-score guidance:
  ``z < 2`` normal, ``2 <= z < 3`` elevated, ``z >= 3`` potential anomaly.

* **Detector B — Isolation Forest.** A multivariate scikit-learn
  ``IsolationForest`` (``n_estimators=100``, ``contamination=0.03``,
  ``random_state=42``) that flags windows that are jointly unusual across
  features. ``contamination=0.03`` is a deliberately conservative prior (about
  3% of windows expected to be flagged) appropriate for an advisory system that
  must minimise false positives; the fixed ``random_state`` makes results
  reproducible. The model is trained on a bounded recent window (see
  ``guardian``) rather than the whole history, for performance.

Neither detector proves fraud — together they surface *unusual behaviour* for
human review.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.services.ai import baseline
from app.services.ai.schemas import (
    SIGNAL_DISTRIBUTION,
    SIGNAL_GAS,
    SIGNAL_INTERARRIVAL,
    SIGNAL_ML,
    SIGNAL_TEMPORAL,
    SIGNAL_VELOCITY,
    SIGNAL_WALLET,
    SignalResult,
    WindowFeatures,
    clamp,
)

# Minimum history before the Isolation Forest is considered trainable.
MIN_TRAIN_SAMPLES = 8
# Minimum observations before trusting the statistical velocity z-score.
MIN_BASELINE_SAMPLES = 3


@dataclass
class DetectionContext:
    """Baseline reference series used to judge the current window."""

    velocities: list[float] = field(default_factory=list)
    interarrivals: list[float] = field(default_factory=list)
    bursts: list[float] = field(default_factory=list)
    wallet_concentrations: list[float] = field(default_factory=list)
    entropies: list[float] = field(default_factory=list)
    gas_stds: list[float] = field(default_factory=list)


class IsolationForestDetector:
    """Thin, testable wrapper around scikit-learn's IsolationForest."""

    def __init__(
        self,
        n_estimators: int = 100,
        contamination: float = 0.03,
        random_state: int = 42,
    ) -> None:
        self.n_estimators = n_estimators
        self.contamination = contamination
        self.random_state = random_state
        self.model = None  # type: ignore[assignment]
        self._score_min: float = 0.0
        self._score_max: float = 0.0
        self.trained = False

    @property
    def available(self) -> bool:
        return self.trained and self.model is not None

    def fit(self, vectors: list[list[float]]) -> bool:
        """Train on ``vectors``; return True on success, False otherwise."""
        if len(vectors) < MIN_TRAIN_SAMPLES:
            self.trained = False
            return False
        try:
            import numpy as np
            from sklearn.ensemble import IsolationForest
        except Exception:  # noqa: BLE001 - degrade gracefully if sklearn absent
            self.trained = False
            return False

        matrix = np.asarray(vectors, dtype=float)
        if matrix.ndim != 2 or matrix.shape[0] < MIN_TRAIN_SAMPLES:
            self.trained = False
            return False

        model = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            random_state=self.random_state,
        )
        model.fit(matrix)
        scores = model.score_samples(matrix)
        self.model = model
        self._score_min = float(scores.min())
        self._score_max = float(scores.max())
        self.trained = True
        return True

    def detect(self, vector: list[float]) -> SignalResult:
        """Return an ML :class:`SignalResult` for a single feature vector."""
        if not self.available:
            return SignalResult(
                name=SIGNAL_ML,
                anomalous=False,
                severity=0.0,
                detail="Isolation Forest not trained (insufficient history).",
                extra={"trained": False},
            )
        try:
            import numpy as np
        except Exception:  # noqa: BLE001
            return SignalResult(name=SIGNAL_ML, detail="numpy unavailable.")

        matrix = np.asarray([vector], dtype=float)
        # score_samples: the lower, the more abnormal.
        raw = float(self.model.score_samples(matrix)[0])  # type: ignore[union-attr]
        prediction = int(self.model.predict(matrix)[0])  # type: ignore[union-attr]
        span = (self._score_max - self._score_min) or 1.0
        severity = clamp((self._score_max - raw) / span)
        anomalous = prediction == -1
        return SignalResult(
            name=SIGNAL_ML,
            anomalous=anomalous,
            severity=severity if anomalous else severity * 0.5,
            detail=(
                "ML detector classified the current window as anomalous."
                if anomalous
                else "ML detector classified the current window as normal."
            ),
            value=round(raw, 6),
            extra={"prediction": prediction, "trained": True},
        )


class StatisticalDetector:
    """Detector A: explainable, baseline-relative thresholding."""

    def detect(
        self, features: WindowFeatures, context: DetectionContext
    ) -> dict[str, SignalResult]:
        return {
            SIGNAL_VELOCITY: self._velocity(features, context),
            SIGNAL_INTERARRIVAL: self._interarrival(features, context),
            SIGNAL_TEMPORAL: self._temporal(features, context),
            SIGNAL_WALLET: self._wallet(features, context),
            SIGNAL_DISTRIBUTION: self._distribution(features, context),
            SIGNAL_GAS: self._gas(features, context),
        }

    def _velocity(
        self, features: WindowFeatures, context: DetectionContext
    ) -> SignalResult:
        z = features.velocity_zscore
        if z is None or len(context.velocities) < MIN_BASELINE_SAMPLES:
            # No defensible baseline yet: report neutral rather than guess.
            return SignalResult(
                name=SIGNAL_VELOCITY,
                anomalous=False,
                severity=0.0,
                value=round(features.voting_velocity, 4),
                detail="Insufficient velocity baseline to score deviation.",
            )
        severity = clamp((z - 1.0) / 4.0)
        anomalous = z >= 3.0
        return SignalResult(
            name=SIGNAL_VELOCITY,
            anomalous=anomalous,
            severity=severity,
            value=round(z, 4),
            detail=f"Voting velocity is {z:.2f}σ from the rolling baseline.",
        )

    def _interarrival(
        self, features: WindowFeatures, context: DetectionContext
    ) -> SignalResult:
        current = features.median_interarrival
        reference = context.interarrivals
        if current is None or not reference:
            return SignalResult(
                name=SIGNAL_INTERARRIVAL,
                anomalous=False,
                detail="No inter-arrival baseline available.",
            )
        base_median = baseline.median(reference)
        if base_median <= 0:
            return SignalResult(
                name=SIGNAL_INTERARRIVAL, anomalous=False, detail="Baseline is zero."
            )
        drop = (base_median - current) / base_median
        severity = clamp(drop / 0.8)
        anomalous = drop >= 0.5
        return SignalResult(
            name=SIGNAL_INTERARRIVAL,
            anomalous=anomalous,
            severity=severity,
            value=round(drop * 100, 2),
            detail=(
                f"Median inter-arrival time changed by {drop * 100:.1f}% "
                f"vs baseline ({base_median:.2f}s -> {current:.2f}s)."
            ),
        )

    def _temporal(
        self, features: WindowFeatures, context: DetectionContext
    ) -> SignalResult:
        burst = features.burst_concentration
        base_burst = baseline.median(context.bursts) if context.bursts else 0.0
        relative = clamp((burst - base_burst) / 0.5) if base_burst else 0.0
        severity = max(clamp((burst - 0.4) / 0.6), relative)
        night_boost = clamp((features.night_fraction - 0.7) / 0.3)
        severity = clamp(max(severity, night_boost * 0.6))
        anomalous = burst >= 0.6 or features.night_fraction >= 0.9
        return SignalResult(
            name=SIGNAL_TEMPORAL,
            anomalous=anomalous,
            severity=severity,
            value=round(burst, 4),
            detail=(
                f"{burst * 100:.0f}% of window votes fall in the busiest "
                f"60s bucket (night share {features.night_fraction * 100:.0f}%)."
            ),
            extra={"burst_concentration": round(burst, 4)},
        )

    def _wallet(
        self, features: WindowFeatures, context: DetectionContext
    ) -> SignalResult:
        conc = features.wallet_concentration
        severity = clamp((conc - 0.3) / 0.7)
        anomalous = conc >= 0.5 and features.vote_count >= 4
        return SignalResult(
            name=SIGNAL_WALLET,
            anomalous=anomalous,
            severity=severity,
            value=round(conc, 4),
            detail=(
                f"Largest single wallet accounts for {conc * 100:.0f}% of window "
                f"votes across {features.unique_voters} unique voters."
            ),
        )

    def _distribution(
        self, features: WindowFeatures, context: DetectionContext
    ) -> SignalResult:
        if features.candidate_entropy is None or features.expected_entropy <= 0:
            return SignalResult(
                name=SIGNAL_DISTRIBUTION,
                anomalous=False,
                detail="Candidate distribution unavailable.",
            )
        normalized = features.candidate_entropy / features.expected_entropy
        severity = clamp(1.0 - normalized)
        anomalous = features.vote_count >= 5 and normalized < 0.5
        return SignalResult(
            name=SIGNAL_DISTRIBUTION,
            anomalous=anomalous,
            severity=severity,
            value=round(normalized, 4),
            detail=(
                f"Candidate entropy {features.candidate_entropy:.3f} is "
                f"{normalized * 100:.0f}% of the maximum for this field."
            ),
        )

    def _gas(
        self, features: WindowFeatures, context: DetectionContext
    ) -> SignalResult:
        if features.gas_stddev is None:
            return SignalResult(
                name=SIGNAL_GAS,
                anomalous=False,
                detail="Gas telemetry unavailable on this chain.",
            )
        reference = context.gas_stds
        if not reference:
            return SignalResult(
                name=SIGNAL_GAS,
                anomalous=False,
                value=round(features.gas_stddev, 4),
                detail="Gas dispersion observed; no baseline yet.",
            )
        base = baseline.mean(reference)
        ratio = features.gas_stddev / base if base > 0 else 1.0
        severity = clamp(abs(ratio - 1.0) / 2.0)
        return SignalResult(
            name=SIGNAL_GAS,
            anomalous=severity >= 0.75,
            severity=severity,
            value=round(ratio, 4),
            detail=f"Gas dispersion ratio vs baseline is {ratio:.2f}.",
        )


class AnomalyDetector:
    """Coordinates the statistical detector and the Isolation Forest."""

    def __init__(
        self,
        n_estimators: int = 100,
        contamination: float = 0.03,
        random_state: int = 42,
    ) -> None:
        self.statistical = StatisticalDetector()
        self.isolation = IsolationForestDetector(
            n_estimators=n_estimators,
            contamination=contamination,
            random_state=random_state,
        )

    def build_context(self, history: list[WindowFeatures]) -> DetectionContext:
        """Construct a :class:`DetectionContext` from preceding windows."""
        return DetectionContext(
            velocities=[w.voting_velocity for w in history],
            interarrivals=[
                w.median_interarrival for w in history if w.median_interarrival
            ],
            bursts=[w.burst_concentration for w in history],
            wallet_concentrations=[w.wallet_concentration for w in history],
            entropies=[w.candidate_entropy for w in history if w.candidate_entropy],
            gas_stds=[w.gas_stddev for w in history if w.gas_stddev],
        )

    def train_ml(self, history: list[WindowFeatures]) -> bool:
        """Train the Isolation Forest on the feature vectors of ``history``."""
        return self.isolation.fit([w.feature_vector() for w in history])

    def detect(
        self, features: WindowFeatures, context: DetectionContext
    ) -> dict[str, SignalResult]:
        """Return a mapping of signal name -> :class:`SignalResult`."""
        results = self.statistical.detect(features, context)
        results[SIGNAL_ML] = self.isolation.detect(features.feature_vector())
        return results
