"""Risk engine for the AI Election Guardian.

Combines per-signal severities into a single bounded 0-100 risk score using the
documented weights in :mod:`app.services.ai.schemas`. Scoring is deterministic:
given the same signal severities the score is always identical, and it is
clamped to ``[0, 100]`` by construction.

Threat bands (documented, stable):
``0-29 NORMAL`` | ``30-59 ELEVATED`` | ``60-84 HIGH`` | ``85-100 CRITICAL``.
"""

from __future__ import annotations

from app.services.ai.schemas import (
    SIGNAL_WEIGHTS,
    RiskResult,
    SignalResult,
    SIGNAL_LABELS,
    clamp,
    threat_level_for,
)

# A severity is converted to a points contribution via this ceiling so a single
# fully-saturated signal cannot by itself reach CRITICAL (defence in depth).
MAX_SIGNAL_SCORE = 100


class RiskEngine:
    """Deterministic weighted aggregation of signal severities."""

    def __init__(self, weights: dict[str, float] | None = None) -> None:
        self.weights = dict(weights or SIGNAL_WEIGHTS)
        total = sum(self.weights.values())
        if total <= 0:
            raise ValueError("signal weights must have a positive sum")
        # Normalise so the documented weights always sum to 1.0 exactly.
        self.weights = {k: v / total for k, v in self.weights.items()}

    def score(self, signals: dict[str, SignalResult]) -> RiskResult:
        """Aggregate signals into a bounded :class:`RiskResult`."""
        raw = 0.0
        contributions: list[dict] = []
        for name, weight in self.weights.items():
            signal = signals.get(name)
            severity = clamp(signal.severity) if signal else 0.0
            points = severity * weight * MAX_SIGNAL_SCORE
            raw += points
            contributions.append(
                {
                    "signal": name,
                    "label": SIGNAL_LABELS.get(name, name),
                    "weight": round(weight, 4),
                    "severity": round(severity, 4),
                    "points": round(points, 3),
                    "anomalous": bool(signal.anomalous) if signal else False,
                    "detail": signal.detail if signal else "",
                }
            )

        score = int(round(clamp(raw, 0.0, 100.0)))
        contributions.sort(key=lambda c: c["points"], reverse=True)
        return RiskResult(
            score=score,
            threat_level=threat_level_for(score),
            contributions=contributions,
        )

    @staticmethod
    def classify(score: int) -> str:
        """Expose the threat-level mapping for a given score."""
        return threat_level_for(score)
