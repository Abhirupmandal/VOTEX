"""Tests for the AI Guardian risk engine (bounded 0-100, deterministic)."""

from __future__ import annotations

import pytest

from app.services.ai.risk_engine import RiskEngine
from app.services.ai.schemas import SIGNAL_NAMES, RiskResult, SignalResult


def _signals(**severities: float) -> dict[str, SignalResult]:
    """Build a full signal map with the given severities (default 0.0)."""
    return {
        name: SignalResult(
            name=name,
            severity=float(severities.get(name, 0.0)),
            anomalous=float(severities.get(name, 0.0)) >= 0.5,
            detail=f"{name} detail",
        )
        for name in SIGNAL_NAMES
    }


def test_weights_are_normalised_to_one() -> None:
    engine = RiskEngine()
    assert sum(engine.weights.values()) == pytest.approx(1.0)


def test_score_is_zero_for_all_normal() -> None:
    result = RiskEngine().score(_signals())
    assert result.score == 0
    assert result.threat_level == "NORMAL"


def test_score_is_bounded_to_100() -> None:
    saturated = RiskEngine().score(_signals(**{n: 1.0 for n in SIGNAL_NAMES}))
    assert saturated.score == 100
    assert 0 <= saturated.score <= 100


def test_threat_bands_are_documented_and_stable() -> None:
    classify = RiskEngine.classify
    assert classify(0) == "NORMAL"
    assert classify(29) == "NORMAL"
    assert classify(30) == "ELEVATED"
    assert classify(59) == "ELEVATED"
    assert classify(60) == "HIGH"
    assert classify(84) == "HIGH"
    assert classify(85) == "CRITICAL"
    assert classify(100) == "CRITICAL"


def test_single_saturated_signal_cannot_reach_critical() -> None:
    # Defence in depth: a single signal contributes at most its weight's share
    # of 100 points, so even the highest-weighted signal (velocity, ~0.25)
    # saturated alone tops out well below the ELEVATED band and can never
    # reach CRITICAL.
    result = RiskEngine().score(_signals(velocity=1.0))
    assert result.threat_level == "NORMAL"
    assert result.score <= 25


def test_scoring_is_deterministic() -> None:
    engine = RiskEngine()
    first = engine.score(_signals(velocity=0.7, temporal=0.5))
    second = engine.score(_signals(velocity=0.7, temporal=0.5))
    assert first.score == second.score
    assert first.threat_level == second.threat_level


def test_multi_signal_aggregation_increases_score() -> None:
    engine = RiskEngine()
    single = engine.score(_signals(velocity=0.8))
    multi = engine.score(_signals(velocity=0.8, interarrival=0.8, wallet=0.8))
    assert multi.score > single.score


def test_contributions_are_sorted_by_points() -> None:
    result = RiskEngine().score(_signals(velocity=1.0, temporal=0.6, gas=0.2))
    points = [c["points"] for c in result.contributions]
    assert points == sorted(points, reverse=True)


def test_custom_weights_are_normalised() -> None:
    engine = RiskEngine(weights={"velocity": 1.0, "temporal": 1.0})
    assert sum(engine.weights.values()) == pytest.approx(1.0)
    result = engine.score(_signals(velocity=1.0, temporal=1.0))
    assert result.score == 100


def test_zero_weight_sum_is_rejected() -> None:
    with pytest.raises(ValueError):
        RiskEngine(weights={"velocity": 0.0})


def test_risk_result_as_dict_roundtrip() -> None:
    result = RiskEngine().score(_signals(velocity=1.0))
    payload = result.as_dict()
    assert isinstance(result, RiskResult)
    assert payload["risk_score"] == result.score
    assert payload["threat_level"] == result.threat_level
