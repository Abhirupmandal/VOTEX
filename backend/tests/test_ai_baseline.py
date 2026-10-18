"""Tests for the AI Guardian statistical baseline primitives.

These are pure-Python (no DB, no sklearn) so they always run and pin down the
deterministic behaviour — including the zero-variance sentinel — that the rest
of the guardian depends on.
"""

from __future__ import annotations

import math

import pytest

from app.services.ai import baseline


def test_mean_and_median() -> None:
    assert baseline.mean([1, 2, 3, 4]) == 2.5
    assert baseline.median([3, 1, 2]) == 2
    assert baseline.median([4, 1, 3, 2]) == 2.5
    assert baseline.mean([]) == 0.0
    assert baseline.median([]) == 0.0


def test_stddev_is_population() -> None:
    # Population variance of [2,4,4,4,5,5,7,9] is 4 -> std 2.
    assert baseline.stddev([2, 4, 4, 4, 5, 5, 7, 9]) == pytest.approx(2.0)


def test_zscore_normal_case() -> None:
    assert baseline.zscore(14.0, 10.0, 2.0) == pytest.approx(2.0)


def test_zscore_zero_variance_returns_bounded_sentinel() -> None:
    # Baseline is perfectly flat but the observation differs: no divide-by-zero,
    # a documented bounded magnitude instead.
    assert baseline.zscore(5.0, 1.0, 0.0) == baseline.ZERO_VARIANCE_Z
    assert baseline.zscore(0.0, 1.0, 0.0) == -baseline.ZERO_VARIANCE_Z


def test_zscore_zero_variance_equal_returns_zero() -> None:
    assert baseline.zscore(1.0, 1.0, 0.0) == 0.0


def test_ewma_weights_recent_values_more() -> None:
    assert baseline.ewma([0.0, 0.0, 10.0], alpha=0.5) == pytest.approx(5.0)
    assert baseline.ewma([], alpha=0.5) == 0.0


def test_ewma_rejects_invalid_alpha() -> None:
    with pytest.raises(ValueError):
        baseline.ewma([1, 2, 3], alpha=0.0)


def test_percentile_interpolates() -> None:
    assert baseline.percentile([1, 2, 3, 4], 50) == pytest.approx(2.5)
    assert baseline.percentile([1, 2, 3, 4], 0) == 1
    assert baseline.percentile([1, 2, 3, 4], 100) == 4


def test_iqr_bounds_flags_outlier() -> None:
    values = [1, 2, 2, 3, 3]
    assert baseline.is_outlier_iqr(100.0, values) is True
    assert baseline.is_outlier_iqr(2.5, values) is False


def test_iqr_requires_minimum_samples() -> None:
    assert baseline.is_outlier_iqr(100.0, [1, 2, 3]) is False


def test_rolling_summary_adapts_and_length_matches() -> None:
    summaries = baseline.rolling_summary([1, 2, 3, 4, 5], window=3)
    assert len(summaries) == 5
    assert summaries[-1].mean == pytest.approx(4.0)
    assert summaries[0].mean == pytest.approx(1.0)
    with pytest.raises(ValueError):
        baseline.rolling_summary([1, 2, 3], window=0)


def test_summarize_empty_is_zeroed() -> None:
    stats = baseline.summarize([])
    assert stats.count == 0
    assert stats.mean == 0.0
    assert stats.std == 0.0


def test_summarize_reports_extremes() -> None:
    stats = baseline.summarize([2, 4, 6])
    assert stats.count == 3
    assert stats.minimum == 2
    assert stats.maximum == 6
    assert math.isclose(stats.mean, 4.0)
