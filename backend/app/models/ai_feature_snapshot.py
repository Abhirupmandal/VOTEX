"""AI feature snapshot table.

A single row is the engineered behavioural feature vector for one analysis
window of one election. These rows are derived EXCLUSIVELY from the indexed
read model (itself derived from on-chain events) — they contain no raw
blockchain duplication beyond the aggregate counts/statistics needed to make an
AI assessment reproducible.

The unique tuple (election_id, window_start, window_end) makes feature
generation idempotent: re-running an analysis over the same window updates the
existing row instead of creating duplicates.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.election import Election


class AIFeatureSnapshot(Base):
    """Engineered behavioural features for one election window."""

    __tablename__ = "ai_feature_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    election_id: Mapped[int] = mapped_column(
        ForeignKey("elections.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Analysis window (election-local unix seconds, i.e. chain block timestamps).
    window_start: Mapped[int] = mapped_column(BigInteger, nullable=False)
    window_end: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Convenience alias: the timestamp the snapshot represents (window end).
    timestamp: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # -- Voting velocity ------------------------------------------------
    vote_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    voting_velocity: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # -- Inter-arrival times (seconds) ----------------------------------
    mean_interarrival: Mapped[float | None] = mapped_column(Float)
    median_interarrival: Mapped[float | None] = mapped_column(Float)

    # -- Velocity deviation ---------------------------------------------
    velocity_zscore: Mapped[float | None] = mapped_column(Float)

    # -- Candidate distribution -----------------------------------------
    candidate_entropy: Mapped[float | None] = mapped_column(Float)

    # -- Wallet activity -------------------------------------------------
    unique_voters: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # -- Gas behaviour (nullable: local chains may not be meaningful) ----
    gas_mean: Mapped[float | None] = mapped_column(Float)
    gas_stddev: Mapped[float | None] = mapped_column(Float)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    election: Mapped["Election"] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "election_id",
            "window_start",
            "window_end",
            name="uq_ai_feature_window",
        ),
        Index("ix_ai_feature_election_end", "election_id", "window_end"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<AIFeatureSnapshot election={self.election_id} "
            f"window=[{self.window_start},{self.window_end}] "
            f"votes={self.vote_count}>"
        )
