"""Tests for AI Guardian feature engineering.

Pure feature math is exercised without a database; a single DB-backed test
confirms :func:`collect_votes` reads the indexed read model correctly.
"""

from __future__ import annotations

import math

import pytest
from sqlalchemy.orm import Session

from app.services.ai import synthetic
from app.services.ai.feature_engineering import (
    VotePoint,
    build_series,
    build_window_features,
    burst_concentration,
    candidate_counts,
    collect_votes,
    gas_stats,
    inter_arrival_stats,
    iter_windows,
    night_fraction,
    votes_in_window,
    wallet_counts,
)


def _p(ts: int, voter: str = "0x1", candidate: int = 1, gas: int | None = 21000) -> VotePoint:
    return VotePoint(timestamp=ts, voter=voter, candidate_id=candidate, gas_used=gas)


def test_votes_in_window_is_half_open() -> None:
    points = [_p(0), _p(5), _p(10), _p(15)]
    # window_start inclusive, window_end exclusive.
    assert [p.timestamp for p in votes_in_window(points, 0, 10)] == [0, 5]
    assert [p.timestamp for p in votes_in_window(points, 10, 15)] == [10]


def test_inter_arrival_mean_and_median() -> None:
    points = [_p(0), _p(10), _p(20), _p(30), _p(40)]
    mean, median = inter_arrival_stats(points)
    assert mean == pytest.approx(10.0)
    assert median == pytest.approx(10.0)


def test_inter_arrival_requires_two_points() -> None:
    assert inter_arrival_stats([_p(1)]) == (None, None)
    assert inter_arrival_stats([]) == (None, None)


def test_candidate_counts_and_uniform_entropy() -> None:
    points = [_p(i, candidate=(i % 4) + 1) for i in range(20)]
    counts = candidate_counts(points)
    assert counts == {1: 5, 2: 5, 3: 5, 4: 5}

    features = build_window_features(
        election_id=1,
        points=points,
        window_start=0,
        window_end=300,
        expected_candidate_count=4,
    )
    assert features.candidate_entropy == pytest.approx(math.log(4), rel=1e-6)


def test_wallet_counts_and_unique_voters() -> None:
    points = [_p(0, "0xa"), _p(1, "0xa"), _p(2, "0xb")]
    assert wallet_counts(points) == {"0xa": 2, "0xb": 1}
    features = build_window_features(
        election_id=1, points=points, window_start=0, window_end=300
    )
    assert features.unique_voters == 2
    assert features.wallet_concentration == pytest.approx(2 / 3)


def test_burst_concentration_single_bucket() -> None:
    points = [_p(t) for t in range(0, 50, 5)]  # all inside one 60s bucket
    assert burst_concentration(points, window_start=0) == pytest.approx(1.0)


def test_burst_concentration_spread() -> None:
    points = [_p(t) for t in (0, 60, 120, 180, 240)]
    assert burst_concentration(points, window_start=0) == pytest.approx(0.2)


def test_night_fraction_bounds() -> None:
    night = [_p(2 * 3600), _p(3 * 3600 + 10)]
    day = [_p(14 * 3600), _p(15 * 3600)]
    assert night_fraction(night) == pytest.approx(1.0)
    assert night_fraction(day) == pytest.approx(0.0)
    assert night_fraction([]) == 0.0


def test_gas_stats_absent_and_present() -> None:
    assert gas_stats([_p(1, gas=None), _p(2, gas=None)]) == (None, None)
    mean, std = gas_stats([_p(1, gas=21000), _p(2, gas=22000)])
    assert mean == pytest.approx(21500.0)
    assert std == pytest.approx(500.0)


def test_build_window_features_core_values() -> None:
    points = [_p(t) for t in range(0, 300, 50)]  # 6 votes over 5 minutes
    features = build_window_features(
        election_id=7, points=points, window_start=0, window_end=300
    )
    assert features.election_id == 7
    assert features.vote_count == 6
    assert features.voting_velocity == pytest.approx(6 / 5.0)  # per minute


def test_build_window_features_empty_window() -> None:
    features = build_window_features(
        election_id=1, points=[], window_start=0, window_end=300
    )
    assert features.vote_count == 0
    assert features.voting_velocity == 0.0
    assert features.candidate_entropy is None
    assert features.unique_voters == 0


def test_iter_windows_partitions_with_final_partial() -> None:
    windows = iter_windows([], window_start=0, window_end=1000, window_seconds=300)
    assert windows == [(0, 300), (300, 600), (600, 900), (900, 1000)]
    with pytest.raises(ValueError):
        iter_windows([], window_start=0, window_end=100, window_seconds=0)


def test_iter_windows_empty_range() -> None:
    assert iter_windows([], window_start=10, window_end=10, window_seconds=60) == []


def test_build_series_assigns_velocity_zscore_on_spike() -> None:
    # Five calm one-vote minutes, then a 100-vote minute.
    points = [_p(t) for t in (10, 70, 130, 190, 250)]
    points += [_p(300 + i) for i in range(100)]
    series = build_series(
        election_id=1,
        points=points,
        window_start=0,
        window_end=360,
        window_seconds=60,
        baseline_window=5,
    )
    assert len(series) == 6
    assert series[0].velocity_zscore is None  # no baseline yet
    assert series[-1].velocity_zscore is not None
    assert series[-1].velocity_zscore > 3.0


def test_feature_vector_arity_is_stable() -> None:
    features = build_window_features(
        election_id=1, points=[_p(0)], window_start=0, window_end=60
    )
    assert len(features.feature_vector()) == 9


def test_collect_votes_reads_indexed_rows(db_session: Session) -> None:
    election = synthetic.ensure_demo_election(
        db_session, blockchain_election_id=910001, scenario="normal"
    )
    points = collect_votes(db_session, election)
    assert len(points) == election.total_votes
    assert all(isinstance(p, VotePoint) for p in points)
    # Ordered by timestamp so windowing is deterministic.
    assert [p.timestamp for p in points] == sorted(p.timestamp for p in points)
