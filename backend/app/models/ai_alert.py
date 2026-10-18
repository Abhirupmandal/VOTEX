"""AI security alert table.

Alerts are SUPERVISORY observations produced by the AI Election Guardian. They
never modify election state, votes, or results — they are advisory records that
recommend human investigation. The ``metadata`` column (exposed as
``alert_metadata`` on the ORM class to avoid the reserved declarative attribute
name) stores the supporting signal evidence so each alert is auditable.
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
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.election import Election

# Allowed alert statuses and types are validated in the service layer.
ALERT_STATUSES = ("OPEN", "ACKNOWLEDGED", "RESOLVED")


class AIAlert(Base):
    """A supervisory security alert for an election."""

    __tablename__ = "ai_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    election_id: Mapped[int] = mapped_column(
        ForeignKey("elections.id", ondelete="CASCADE"), nullable=False, index=True
    )

    risk_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    threat_level: Mapped[str] = mapped_column(String(16), nullable=False, default="NORMAL")

    alert_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="OPEN", index=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Correlates repeated observations of the same anomaly for deduplication.
    dedup_key: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    occurrence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    window_start: Mapped[int | None] = mapped_column(BigInteger)
    window_end: Mapped[int | None] = mapped_column(BigInteger)

    model_version: Mapped[str | None] = mapped_column(String(32))

    # Column is named "metadata"; ORM attribute renamed to avoid clashing with
    # SQLAlchemy's declarative ``metadata`` registry attribute.
    alert_metadata: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    election: Mapped["Election"] = relationship()

    __table_args__ = (
        Index("ix_ai_alerts_election_status", "election_id", "status"),
        Index("ix_ai_alerts_election_detected", "election_id", "detected_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<AIAlert id={self.id} election={self.election_id} "
            f"type={self.alert_type} status={self.status}>"
        )
