"""Pydantic schemas for the AI Election Guardian API surface.

These models describe the SUPERVISORY AI outputs exposed by the guardian, risk,
alert, feature, and analysis endpoints. They carry no authority over election
state: every response is advisory and, at most, recommends human investigation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

# Re-stated here so API responses always carry the safety disclaimer even if a
# service-layer payload omits it.
AI_DISCLAIMER = (
    "AI Guardian detects anomalous behaviour; it does not prove electoral fraud "
    "and does not control election state or vote totals."
)


class AISignalOut(BaseModel):
    """One detector signal for a window."""

    signal: str
    label: str
    severity: float
    anomalous: bool
    detail: str = ""
    value: float | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class AIContributionOut(BaseModel):
    """Weighted contribution of a signal to the risk score."""

    signal: str
    label: str
    weight: float
    severity: float
    points: float
    anomalous: bool = False
    detail: str = ""


class AIExplanationOut(BaseModel):
    """Human-readable, value-grounded explanation of a risk score."""

    summary: str = ""
    reasons: list[str] = Field(default_factory=list)
    top_signals: list[dict[str, Any]] = Field(default_factory=list)
    recommendation: str | None = None
    cold_start: bool = False
    disclaimer: str | None = None


class AIFeatureSnapshotOut(BaseModel):
    """A persisted engineered feature vector for one window."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    election_id: int
    window_start: int
    window_end: int
    timestamp: int
    vote_count: int
    voting_velocity: float
    mean_interarrival: float | None = None
    median_interarrival: float | None = None
    velocity_zscore: float | None = None
    candidate_entropy: float | None = None
    unique_voters: int
    gas_mean: float | None = None
    gas_stddev: float | None = None
    created_at: datetime | None = None


class AIFeaturesOut(BaseModel):
    """Collection wrapper for an election's feature snapshots."""

    election_id: int
    count: int
    observations: int
    calibrating: bool
    model_version: str
    items: list[AIFeatureSnapshotOut] = Field(default_factory=list)


class AIRiskOut(BaseModel):
    """Latest supervision risk for an election."""

    election_id: int
    risk_score: int
    threat_level: str
    guardian_status: str
    signals: list[dict[str, Any]] = Field(default_factory=list)
    explanation: dict[str, Any] | None = None
    window_start: int | None = None
    window_end: int | None = None
    analyzed_at: datetime | None = None
    active_alerts: int = 0
    model_version: str
    recommendation: str | None = None
    actionable: bool = False
    supervisory_only: bool = True
    disclaimer: str = AI_DISCLAIMER


class AIAlertOut(BaseModel):
    """A persisted supervisory security alert."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    election_id: int
    risk_score: int
    threat_level: str
    alert_type: str
    title: str
    description: str
    detected_at: datetime | None = None
    status: str
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None
    dedup_key: str
    occurrence_count: int
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    window_start: int | None = None
    window_end: int | None = None
    model_version: str | None = None
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("alert_metadata", "metadata"),
    )


class PaginatedAlerts(BaseModel):
    """Paginated alerts collection (dashboard-ready)."""

    items: list[AIAlertOut] = Field(default_factory=list)
    page: int
    page_size: int
    total: int
    pages: int
    source: str = Field(
        default="indexed",
        description="Alerts are AI supervisory observations over the indexed view.",
    )


class GuardianStatusOut(BaseModel):
    """Aggregate guardian status for the SOC/dashboard."""

    status: str
    risk_score: int
    threat_level: str
    last_analysis: datetime | None = None
    active_alerts: int = 0
    elections_monitored: int = 0
    model_version: str
    supervisory_only: bool = True
    disclaimer: str = AI_DISCLAIMER


class AIAnalysisOut(BaseModel):
    """The full result of one on-demand election analysis."""

    election_id: int
    risk_score: int
    threat_level: str
    guardian_status: str
    cold_start: bool
    signals: list[AISignalOut] = Field(default_factory=list)
    contributions: list[AIContributionOut] = Field(default_factory=list)
    explanation: AIExplanationOut
    features: dict[str, Any] = Field(default_factory=dict)
    window_start: int
    window_end: int
    analyzed_at: datetime
    model_version: str
    alerts_created: int
    observations: int
    supervisory_only: bool = True
    disclaimer: str = AI_DISCLAIMER
