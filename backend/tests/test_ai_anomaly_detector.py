"""Tests for the AI Guardian anomaly detectors.

Covers Detector A (statistical, baseline-relative thresholding) and Detector B
(the scikit-learn Isolation Forest wrapper). All tests are pure-python and do
not require a database.
"""

from __future__ import annotations

from app.services.ai.anomaly_detector import (
    MIN_TRAIN_SAMPLES,
    AnomalyDetector,
    DetectionContext,
    IsolationForestDetector,
    StatisticalDetector,
)
from app.services.ai.schemas import (
    SIGNAL_DISTRIBUTION,
    SIGNAL_INTERARRIVAL,
    SIGNAL_ML,
    SIGNAL_TEMPORAL,
    SIGNAL_VELOCITY,
    SIGNAL_WALLET,
    WindowFeatures,
)


def _features(**overrides) -> WindowFeatures:
    base = dict(
        election_id=1,
        window_start=0,
        window_end=300,
        vote_count=10,
        voting_velocity=2.0,
        mean_interarrival=30.0,
        median_interarrival=30.0,
        velocity_zscore=0.5,
        candidate_entropy=1.3,
        unique_voters=10,
        gas_mean=21000.0,
        gas_stddev=200.0,
        burst_concentration=0.2,
        wallet_concentration=0.1,
        night_fraction=0.0,
        expected_entropy=1.386,
    )
    base.update(overrides)
    return WindowFeatures(**base)


def _context(**overrides) -> DetectionContext:
    base = dict(
        velocities=[1.8, 2.0, 2.2],
        interarrivals=[30.0, 31.0, 29.0],
        bursts=[0.2, 0.15, 0.25],
        wallet_concentrations=[0.1, 0.12, 0.11],
        entropies=[1.3, 1.35, 1.32],
        gas_stds=[200.0, 210.0, 190.0],
    )
    base.update(overrides)
    return DetectionContext(**base)


# -- Detector A: statistical ------------------------------------------------


def test_statistical_normal_window_stays_normal() -> None:
    signals = StatisticalDetector().detect(_features(), _context())
    for name in (
        SIGNAL_VELOCITY,
        SIGNAL_INTERARRIVAL,
        SIGNAL_TEMPORAL,
        SIGNAL_WALLET,
        SIGNAL_DISTRIBUTION,
    ):
        assert signals[name].anomalous is False


def test_statistical_detector_returns_six_signals() -> None:
    signals = StatisticalDetector().detect(_features(), _context())
    assert set(signals) == {
        SIGNAL_VELOCITY,
        SIGNAL_INTERARRIVAL,
        SIGNAL_TEMPORAL,
        SIGNAL_WALLET,
        SIGNAL_DISTRIBUTION,
        "gas",
    }


def test_velocity_spike_is_flagged() -> None:
    signals = StatisticalDetector().detect(
        _features(velocity_zscore=4.5), _context()
    )
    velocity = signals[SIGNAL_VELOCITY]
    assert velocity.anomalous is True
    assert velocity.severity > 0.5


def test_interarrival_compression_is_flagged() -> None:
    signals = StatisticalDetector().detect(
        _features(median_interarrival=5.0), _context()
    )
    inter = signals[SIGNAL_INTERARRIVAL]
    assert inter.anomalous is True
    # (30 - 5) / 30 == 0.83 drop, comfortably over the 0.5 anomaly bar.
    assert inter.value == 83.33


def test_temporal_burst_is_flagged() -> None:
    signals = StatisticalDetector().detect(
        _features(burst_concentration=0.8), _context()
    )
    temporal = signals[SIGNAL_TEMPORAL]
    assert temporal.anomalous is True
    assert temporal.severity >= 0.6


def test_wallet_concentration_is_flagged() -> None:
    signals = StatisticalDetector().detect(
        _features(wallet_concentration=0.9, vote_count=10), _context()
    )
    wallet = signals[SIGNAL_WALLET]
    assert wallet.anomalous is True


def test_candidate_distribution_collapse_is_flagged() -> None:
    signals = StatisticalDetector().detect(
        _features(candidate_entropy=0.1, expected_entropy=1.386, vote_count=10),
        _context(),
    )
    dist = signals[SIGNAL_DISTRIBUTION]
    assert dist.anomalous is True
    assert dist.severity > 0.5


def test_insufficient_velocity_baseline_is_neutral() -> None:
    signals = StatisticalDetector().detect(
        _features(velocity_zscore=5.0), _context(velocities=[])
    )
    velocity = signals[SIGNAL_VELOCITY]
    assert velocity.anomalous is False
    assert velocity.severity == 0.0


# -- Detector B: Isolation Forest -------------------------------------------


def test_isolation_forest_requires_min_samples() -> None:
    detector = IsolationForestDetector()
    trained = detector.fit([[float(i), float(i)] for i in range(MIN_TRAIN_SAMPLES - 1)])
    assert trained is False
    assert detector.available is False


def test_isolation_forest_detect_without_training_is_inert() -> None:
    detector = IsolationForestDetector()
    result = detector.detect([0.0] * 9)
    assert result.name == SIGNAL_ML
    assert result.anomalous is False
    assert result.extra["trained"] is False


def test_isolation_forest_trains_and_detects() -> None:
    detector = IsolationForestDetector()
    vectors = [
        _features(vote_count=10 + i, voting_velocity=2.0 + 0.1 * i).feature_vector()
        for i in range(12)
    ]
    assert detector.fit(vectors) is True
    assert detector.available is True

    result = detector.detect(vectors[0])
    assert result.name == SIGNAL_ML
    assert result.extra["trained"] is True
    assert 0.0 <= result.severity <= 1.0


# -- Coordinator ------------------------------------------------------------


def test_build_context_mirrors_history_series() -> None:
    history = [
        _features(voting_velocity=2.0, median_interarrival=30.0),
        _features(voting_velocity=3.0, median_interarrival=20.0),
    ]
    context = AnomalyDetector().build_context(history)
    assert context.velocities == [2.0, 3.0]
    assert context.interarrivals == [30.0, 20.0]


def test_detector_returns_statistical_signals_plus_ml() -> None:
    detector = AnomalyDetector()
    signals = detector.detect(_features(), _context())
    assert SIGNAL_ML in signals
    assert len(signals) == 7


def test_train_ml_returns_false_without_enough_history() -> None:
    detector = AnomalyDetector()
    assert detector.train_ml([_features()]) is False
