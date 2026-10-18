"""Feature engineering for the AI Election Guardian.

Turns indexed vote telemetry into a behavioural feature vector for a window.
All inputs come from the off-chain indexed read model (itself derived from
on-chain events); nothing here touches the blockchain or mutates election data.

Features are deliberately simple, deterministic, and explainable:

* **Voting velocity**      — votes per minute within the window.
* **Inter-arrival times**  — mean/median seconds between consecutive votes.
* **Velocity deviation**   — z-score of velocity against a rolling baseline.
* **Candidate distribution** — Shannon entropy of votes per candidate.
* **Temporal pattern**     — burst concentration (busiest 60s share) + night share.
* **Wallet activity**      — unique voters + single-wallet concentration.
* **Gas behaviour**        — mean/std of gas used where the chain exposes it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.election import Election
from app.models.vote import Vote
from app.services.ai import baseline
from app.services.ai.schemas import WindowFeatures, shannon_entropy

# Nighttime (local hour, inclusive-exclusive) used by the temporal feature.
# Chain timestamps are UTC seconds; the offset lets a deployment align to its
# local civil time without changing persisted data.
NIGHT_START_HOUR = 0
NIGHT_END_HOUR = 6
# Size of the temporal bucket (seconds) used to measure bursts.
BURST_BUCKET_SECONDS = 60


@dataclass(frozen=True)
class VotePoint:
    """A minimal, immutable view of one indexed vote."""

    timestamp: int
    voter: str
    candidate_id: int
    gas_used: int | None = None
    block_number: int = 0


def collect_votes(session: Session, election: Election) -> list[VotePoint]:
    """Load indexed votes for an election as ordered :class:`VotePoint`s."""
    rows = session.scalars(
        select(Vote)
        .where(Vote.election_id == election.id)
        .order_by(Vote.timestamp, Vote.block_number, Vote.log_index)
    ).all()
    return [
        VotePoint(
            timestamp=int(row.timestamp or 0),
            voter=(row.voter_address or "").lower(),
            candidate_id=int(row.blockchain_candidate_id),
            gas_used=int(row.gas_used) if row.gas_used is not None else None,
            block_number=int(row.block_number or 0),
        )
        for row in rows
    ]


def votes_in_window(
    points: list[VotePoint], window_start: int, window_end: int
) -> list[VotePoint]:
    """Return votes with ``window_start <= timestamp < window_end``."""
    return [p for p in points if window_start <= p.timestamp < window_end]


def inter_arrival_stats(points: list[VotePoint]) -> tuple[float | None, float | None]:
    """Return ``(mean, median)`` seconds between consecutive votes, or Nones."""
    if len(points) < 2:
        return None, None
    timestamps = sorted(p.timestamp for p in points)
    gaps = [float(timestamps[i + 1] - timestamps[i]) for i in range(len(timestamps) - 1)]
    if not gaps:
        return None, None
    return baseline.mean(gaps), baseline.median(gaps)


def candidate_counts(points: list[VotePoint]) -> dict[int, int]:
    """Votes per candidate id."""
    counts: dict[int, int] = {}
    for point in points:
        counts[point.candidate_id] = counts.get(point.candidate_id, 0) + 1
    return counts


def wallet_counts(points: list[VotePoint]) -> dict[str, int]:
    """Votes per voting wallet."""
    counts: dict[str, int] = {}
    for point in points:
        counts[point.voter] = counts.get(point.voter, 0) + 1
    return counts


def burst_concentration(
    points: list[VotePoint], window_start: int, bucket_seconds: int = BURST_BUCKET_SECONDS
) -> float:
    """Share of the window's votes landing in the busiest bucket (0..1)."""
    if not points or bucket_seconds <= 0:
        return 0.0
    buckets: dict[int, int] = {}
    for point in points:
        idx = (point.timestamp - window_start) // bucket_seconds
        buckets[idx] = buckets.get(idx, 0) + 1
    return max(buckets.values()) / len(points)


def night_fraction(
    points: list[VotePoint], offset_seconds: int = 0
) -> float:
    """Share of votes cast during nighttime (default 00:00-06:00 UTC)."""
    if not points:
        return 0.0
    night = 0
    for point in points:
        hour = ((point.timestamp + offset_seconds) // 3600) % 24
        if NIGHT_START_HOUR <= hour < NIGHT_END_HOUR:
            night += 1
    return night / len(points)


def gas_stats(points: list[VotePoint]) -> tuple[float | None, float | None]:
    """Return ``(mean, stddev)`` of gas used, or Nones when unavailable."""
    values = [float(p.gas_used) for p in points if p.gas_used is not None]
    if not values:
        return None, None
    return baseline.mean(values), baseline.stddev(values)


def build_window_features(
    *,
    election_id: int,
    points: list[VotePoint],
    window_start: int,
    window_end: int,
    expected_candidate_count: int = 0,
    baseline_velocities: list[float] | None = None,
    tz_offset_seconds: int = 0,
) -> WindowFeatures:
    """Compute the feature vector for a single window.

    ``points`` may be the full election history; only votes inside the window
    are counted. Pass ``baseline_velocities`` (preceding windows' velocities) to
    obtain a ``velocity_zscore``.
    """
    window_points = votes_in_window(points, window_start, window_end)
    span_seconds = max(1, window_end - window_start)
    count = len(window_points)

    velocity = count / (span_seconds / 60.0)
    mean_ia, median_ia = inter_arrival_stats(window_points)

    counts = candidate_counts(window_points)
    entropy = shannon_entropy(list(counts.values())) if counts else None
    expected_entropy = (
        math.log(expected_candidate_count) if expected_candidate_count > 1 else 0.0
    )

    wallets = wallet_counts(window_points)
    unique = len(wallets)
    if count > 0:
        max_wallet_share = max(wallets.values()) / count
    else:
        max_wallet_share = 0.0

    gas_mean, gas_std = gas_stats(window_points)

    zscore_value: float | None = None
    if baseline_velocities:
        stats = baseline.summarize(baseline_velocities)
        zscore_value = baseline.zscore(velocity, stats.mean, stats.std)

    return WindowFeatures(
        election_id=election_id,
        window_start=window_start,
        window_end=window_end,
        vote_count=count,
        voting_velocity=velocity,
        mean_interarrival=mean_ia,
        median_interarrival=median_ia,
        velocity_zscore=zscore_value,
        candidate_entropy=entropy,
        unique_voters=unique,
        gas_mean=gas_mean,
        gas_stddev=gas_std,
        burst_concentration=burst_concentration(window_points, window_start),
        wallet_concentration=max_wallet_share,
        night_fraction=night_fraction(window_points, offset_seconds=tz_offset_seconds),
        expected_entropy=expected_entropy,
    )


def iter_windows(
    points: list[VotePoint],
    *,
    window_start: int,
    window_end: int,
    window_seconds: int,
) -> list[tuple[int, int]]:
    """Partition ``[window_start, window_end]`` into fixed windows."""
    if window_seconds <= 0:
        raise ValueError("window_seconds must be positive")
    windows: list[tuple[int, int]] = []
    start = window_start
    while start < window_end:
        end = min(start + window_seconds, window_end)
        windows.append((start, end))
        start = end
    return windows


def build_series(
    *,
    election_id: int,
    points: list[VotePoint],
    window_start: int,
    window_end: int,
    window_seconds: int,
    expected_candidate_count: int = 0,
    baseline_window: int = 10,
    tz_offset_seconds: int = 0,
) -> list[WindowFeatures]:
    """Build an ordered feature series with a rolling velocity baseline.

    Each window's ``velocity_zscore`` uses up to ``baseline_window`` preceding
    window velocities, so the baseline adapts as legitimate behaviour changes.
    """
    windows = iter_windows(
        points,
        window_start=window_start,
        window_end=window_end,
        window_seconds=window_seconds,
    )
    series: list[WindowFeatures] = []
    velocities: list[float] = []
    for start, end in windows:
        history = velocities[-baseline_window:] if baseline_window > 0 else velocities
        features = build_window_features(
            election_id=election_id,
            points=points,
            window_start=start,
            window_end=end,
            expected_candidate_count=expected_candidate_count,
            baseline_velocities=history,
            tz_offset_seconds=tz_offset_seconds,
        )
        series.append(features)
        velocities.append(features.voting_velocity)
    return series
