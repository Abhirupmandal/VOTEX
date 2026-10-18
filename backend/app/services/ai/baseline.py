"""Statistical baseline primitives for the AI Election Guardian.

Pure-Python helpers (no numpy dependency) so behaviour — including the tricky
zero-variance case — is fully deterministic and easy to unit-test.

The baseline ADAPTS: callers pass the most recent ``window`` observations, so
legitimate changes in behaviour move the reference over time. A rising voting
rate is therefore not, by itself, treated as malicious.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# Bounded sentinel returned by :func:`zscore` when the baseline has (near) zero
# variance and the observation nonetheless differs from the mean. Returning a
# fixed, documented magnitude keeps downstream scoring deterministic instead of
# dividing by ~zero.
ZERO_VARIANCE_Z = 10.0

_EPS = 1e-9


@dataclass
class SeriesStats:
    """Summary statistics for a series of observations."""

    count: int
    mean: float
    std: float
    median: float
    minimum: float
    maximum: float


def mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return float(sum(values)) / len(values)


def variance(values: list[float], ddof: int = 0) -> float:
    if len(values) - ddof <= 0:
        return 0.0
    mu = mean(values)
    return float(sum((v - mu) ** 2 for v in values) / (len(values) - ddof))


def stddev(values: list[float], ddof: int = 0) -> float:
    return math.sqrt(variance(values, ddof=ddof))


def median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    n = len(ordered)
    mid = n // 2
    if n % 2 == 1:
        return float(ordered[mid])
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def percentile(values: list[float], pct: float) -> float:
    """Linear-interpolation percentile (``pct`` in ``[0, 100]``)."""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (pct / 100.0) * (len(ordered) - 1)
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return float(ordered[int(rank)])
    frac = rank - low
    return ordered[low] * (1 - frac) + ordered[high] * frac


def summarize(values: list[float]) -> SeriesStats:
    """Return mean, (population) std, median, min, and max for a series."""
    if not values:
        return SeriesStats(0, 0.0, 0.0, 0.0, 0.0, 0.0)
    return SeriesStats(
        count=len(values),
        mean=mean(values),
        std=stddev(values),
        median=median(values),
        minimum=float(min(values)),
        maximum=float(max(values)),
    )


def zscore(value: float, mu: float, sigma: float, eps: float = _EPS) -> float:
    """Standard score with explicit zero-variance handling.

    * ``sigma`` meaningful       -> ``(value - mu) / sigma``
    * ``sigma`` ~ 0, value ~ mu  -> ``0.0``
    * ``sigma`` ~ 0, value != mu -> ``±ZERO_VARIANCE_Z`` (bounded sentinel)
    """
    if sigma > eps:
        return (value - mu) / sigma
    if abs(value - mu) <= eps:
        return 0.0
    return math.copysign(ZERO_VARIANCE_Z, value - mu)


def ewma(values: list[float], alpha: float = 0.3) -> float:
    """Exponentially weighted moving average (most recent value weighted most)."""
    if not values:
        return 0.0
    if not 0.0 < alpha <= 1.0:
        raise ValueError("alpha must be in (0, 1]")
    result = float(values[0])
    for value in values[1:]:
        result = alpha * float(value) + (1 - alpha) * result
    return result


def iqr_bounds(values: list[float], k: float = 1.5) -> tuple[float, float]:
    """Tukey IQR fences ``(lower, upper)`` for outlier detection."""
    if len(values) < 2:
        if not values:
            return (0.0, 0.0)
        return (float(values[0]), float(values[0]))
    q1 = percentile(values, 25)
    q3 = percentile(values, 75)
    iqr = q3 - q1
    return (q1 - k * iqr, q3 + k * iqr)


def is_outlier_iqr(value: float, values: list[float], k: float = 1.5) -> bool:
    """True when ``value`` falls outside the IQR fences of ``values``."""
    if len(values) < 4:
        return False
    lower, upper = iqr_bounds(values, k=k)
    return value < lower or value > upper


def rolling_summary(values: list[float], window: int) -> list[SeriesStats]:
    """Return a :class:`SeriesStats` for every trailing ``window`` slice."""
    if window <= 0:
        raise ValueError("window must be positive")
    summaries: list[SeriesStats] = []
    for end in range(1, len(values) + 1):
        start = max(0, end - window)
        summaries.append(summarize(values[start:end]))
    return summaries
