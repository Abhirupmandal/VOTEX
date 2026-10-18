"""Shared constants and dataclasses for the AI Election Guardian.

Keeping the tunable configuration and the internal data structures here makes
every downstream module deterministic and auditable: the scoring weights,
threat-level bands, signal names, and the model version are all declared once.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

# -- Model / rule version -------------------------------------------------
# Stored on every persisted assessment so results remain attributable even
# after the scoring logic changes.
AI_GUARDIAN_VERSION = "0.1.0"

# -- Signal names ---------------------------------------------------------
SIGNAL_VELOCITY = "velocity"
SIGNAL_INTERARRIVAL = "interarrival"
SIGNAL_TEMPORAL = "temporal"
SIGNAL_WALLET = "wallet"
SIGNAL_DISTRIBUTION = "candidate_distribution"
SIGNAL_GAS = "gas"
SIGNAL_ML = "ml"

SIGNAL_NAMES: tuple[str, ...] = (
    SIGNAL_VELOCITY,
    SIGNAL_INTERARRIVAL,
    SIGNAL_TEMPORAL,
    SIGNAL_WALLET,
    SIGNAL_DISTRIBUTION,
    SIGNAL_GAS,
    SIGNAL_ML,
)

# -- Deterministic, documented signal weights (must sum to 1.0) ------------
SIGNAL_WEIGHTS: dict[str, float] = {
    SIGNAL_VELOCITY: 0.25,
    SIGNAL_INTERARRIVAL: 0.20,
    SIGNAL_TEMPORAL: 0.15,
    SIGNAL_WALLET: 0.15,
    SIGNAL_DISTRIBUTION: 0.10,
    SIGNAL_GAS: 0.05,
    SIGNAL_ML: 0.10,
}

# -- Threat-level bands (documented; do not change casually) ---------------
THREAT_NORMAL = "NORMAL"
THREAT_ELEVATED = "ELEVATED"
THREAT_HIGH = "HIGH"
THREAT_CRITICAL = "CRITICAL"

THREAT_BANDS: tuple[tuple[int, int, str], ...] = (
    (0, 29, THREAT_NORMAL),
    (30, 59, THREAT_ELEVATED),
    (60, 84, THREAT_HIGH),
    (85, 100, THREAT_CRITICAL),
)

# -- Guardian statuses ----------------------------------------------------
STATUS_OFFLINE = "OFFLINE"
STATUS_CALIBRATING = "CALIBRATING"
STATUS_MONITORING = "MONITORING"
STATUS_ELEVATED = "ELEVATED"
STATUS_HIGH_RISK = "HIGH_RISK"
STATUS_CRITICAL = "CRITICAL"

# -- Alert types ----------------------------------------------------------
ALERT_VELOCITY_SPIKE = "VELOCITY_SPIKE"
ALERT_TEMPORAL_ANOMALY = "TEMPORAL_ANOMALY"
ALERT_WALLET_PATTERN = "WALLET_PATTERN"
ALERT_DISTRIBUTION_ANOMALY = "DISTRIBUTION_ANOMALY"
ALERT_ML_ANOMALY = "ML_ANOMALY"
ALERT_COMPOSITE_RISK = "COMPOSITE_RISK"

ALERT_TYPES: tuple[str, ...] = (
    ALERT_VELOCITY_SPIKE,
    ALERT_TEMPORAL_ANOMALY,
    ALERT_WALLET_PATTERN,
    ALERT_DISTRIBUTION_ANOMALY,
    ALERT_ML_ANOMALY,
    ALERT_COMPOSITE_RISK,
)

# Maps a signal name to the alert type it raises.
ALERT_TYPE_BY_SIGNAL: dict[str, str] = {
    SIGNAL_VELOCITY: ALERT_VELOCITY_SPIKE,
    SIGNAL_INTERARRIVAL: ALERT_TEMPORAL_ANOMALY,
    SIGNAL_TEMPORAL: ALERT_TEMPORAL_ANOMALY,
    SIGNAL_WALLET: ALERT_WALLET_PATTERN,
    SIGNAL_DISTRIBUTION: ALERT_DISTRIBUTION_ANOMALY,
    SIGNAL_ML: ALERT_ML_ANOMALY,
}

# Human-readable labels per signal.
SIGNAL_LABELS: dict[str, str] = {
    SIGNAL_VELOCITY: "Voting velocity anomaly",
    SIGNAL_INTERARRIVAL: "Inter-arrival time anomaly",
    SIGNAL_TEMPORAL: "Temporal concentration anomaly",
    SIGNAL_WALLET: "Wallet behaviour anomaly",
    SIGNAL_DISTRIBUTION: "Candidate distribution anomaly",
    SIGNAL_GAS: "Gas behaviour anomaly",
    SIGNAL_ML: "ML anomaly",
}

# -- Guardrails -----------------------------------------------------------
# The guardian is SUPERVISORY. These capability flags are asserted by tests and
# documented; the codebase contains no write path from AI to the blockchain.
SUPERVISORY_ONLY = True
RECOMMENDATION_HUMAN_INVESTIGATION = "HUMAN INVESTIGATION REQUIRED"

_EPS = 1e-9


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    """Clamp ``value`` into the inclusive ``[low, high]`` range."""
    if value < low:
        return low
    if value > high:
        return high
    return value


def threat_level_for(score: int) -> str:
    """Map a 0-100 risk score to a documented threat level."""
    bounded = max(0, min(100, int(score)))
    for low, high, label in THREAT_BANDS:
        if low <= bounded <= high:
            return label
    return THREAT_NORMAL


@dataclass
class WindowFeatures:
    """Engineered behavioural features for one election analysis window."""

    election_id: int
    window_start: int
    window_end: int
    vote_count: int = 0
    voting_velocity: float = 0.0
    mean_interarrival: float | None = None
    median_interarrival: float | None = None
    velocity_zscore: float | None = None
    candidate_entropy: float | None = None
    unique_voters: int = 0
    gas_mean: float | None = None
    gas_stddev: float | None = None

    # Extra (non-persisted) signals used by the detectors.
    burst_concentration: float = 0.0
    wallet_concentration: float = 0.0
    night_fraction: float = 0.0
    expected_entropy: float = 0.0

    @property
    def timestamp(self) -> int:
        return self.window_end

    def as_dict(self) -> dict[str, Any]:
        """Column-aligned mapping used to persist an ``AIFeatureSnapshot``.

        Keys match the ORM model exactly, so callers may spread this directly
        into ``AIFeatureSnapshot(**features.as_dict())``.
        """
        return {
            "election_id": self.election_id,
            "window_start": self.window_start,
            "window_end": self.window_end,
            "timestamp": self.window_end,
            "vote_count": self.vote_count,
            "voting_velocity": round(self.voting_velocity, 4),
            "mean_interarrival": _round_opt(self.mean_interarrival),
            "median_interarrival": _round_opt(self.median_interarrival),
            "velocity_zscore": _round_opt(self.velocity_zscore),
            "candidate_entropy": _round_opt(self.candidate_entropy),
            "unique_voters": self.unique_voters,
            "gas_mean": _round_opt(self.gas_mean),
            "gas_stddev": _round_opt(self.gas_stddev),
        }

    def as_payload(self) -> dict[str, Any]:
        """Superset of :meth:`as_dict` for API/demo output.

        Adds the detector-only behavioural features (which are not persisted as
        columns) so every signal the guardian reports stays explainable from the
        returned feature view.
        """
        payload = self.as_dict()
        payload.update(
            {
                "burst_concentration": round(self.burst_concentration, 4),
                "wallet_concentration": round(self.wallet_concentration, 4),
                "night_fraction": round(self.night_fraction, 4),
                "expected_entropy": round(self.expected_entropy, 4),
            }
        )
        return payload

    def feature_vector(self) -> list[float]:
        """Deterministic numeric vector for the Isolation Forest.

        ``None`` values are replaced with ``0.0`` sentinels (documented) so the
        vector has a fixed arity regardless of missing telemetry.
        """
        return [
            float(self.vote_count),
            float(self.voting_velocity),
            float(self.mean_interarrival or 0.0),
            float(self.median_interarrival or 0.0),
            float(self.candidate_entropy or 0.0),
            float(self.unique_voters),
            float(self.burst_concentration),
            float(self.wallet_concentration),
            float(self.night_fraction),
        ]


def _round_opt(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 4)


@dataclass
class SignalResult:
    """Outcome of a single detector for a single window."""

    name: str
    severity: float = 0.0  # normalised 0..1
    anomalous: bool = False
    detail: str = ""
    value: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "signal": self.name,
            "label": SIGNAL_LABELS.get(self.name, self.name),
            "severity": round(self.severity, 4),
            "anomalous": self.anomalous,
            "detail": self.detail,
            "value": _round_opt(self.value),
            "extra": self.extra,
        }


@dataclass
class RiskResult:
    """Aggregated risk for a window."""

    score: int
    threat_level: str
    contributions: list[dict[str, Any]]
    cold_start: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "risk_score": self.score,
            "threat_level": self.threat_level,
            "cold_start": self.cold_start,
            "contributions": self.contributions,
        }


def shannon_entropy(counts: list[int]) -> float:
    """Natural-log Shannon entropy of a discrete distribution."""
    total = sum(c for c in counts if c > 0)
    if total <= 0:
        return 0.0
    entropy = 0.0
    for c in counts:
        if c <= 0:
            continue
        p = c / total
        entropy -= p * math.log(p)
    return entropy
