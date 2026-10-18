"""AI risk assessment table.

Every AI assessment is persisted with the scoring ``model_version`` and the
analysis window so it remains reproducible and attributable even after the
scoring logic evolves. ``signals`` holds the per-signal contributions and
``explanation`` holds the human-readable reasons derived from the measured
feature values.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.election import Election


class AIRiskAssessment(Base):
    """A persisted AI Guardian risk assessment for an election window."""

    __tablename__ = "ai_risk_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    election_id: Mapped[int] = mapped_column(
        ForeignKey("elections.id", ondelete="CASCADE"), nullable=False, index=True
    )

    risk_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    threat_level: Mapped[str] = mapped_column(String(16), nullable=False, default="NORMAL")
    guardian_status: Mapped[str] = mapped_column(String(16), nullable=False, default="OFFLINE")

    # Rule/model version used — critical for auditability.
    model_version: Mapped[str] = mapped_column(String(32), nullable=False, default="0.1.0")

    analysis_window_start: Mapped[int] = mapped_column(BigInteger, nullable=False)
    analysis_window_end: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # Per-signal severity + contribution and the full feature vector used.
    signals: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    explanation: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    feature_snapshot_id: Mapped[int | None] = mapped_column(
        ForeignKey("ai_feature_snapshots.id", ondelete="SET NULL")
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    election: Mapped["Election"] = relationship()

    __table_args__ = (
        Index("ix_ai_risk_election_created", "election_id", "created_at"),
        Index("ix_ai_risk_election_window", "election_id", "analysis_window_end"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<AIRiskAssessment election={self.election_id} "
            f"score={self.risk_score} level={self.threat_level}>"
        )
