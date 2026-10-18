"""Candidate read-model table (indexed view of on-chain candidates)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.election import Election


class Candidate(Base):
    """Indexed representation of an election candidate."""

    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # 1-based on-chain candidate id, unique within an election.
    blockchain_candidate_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    election_id: Mapped[int] = mapped_column(
        ForeignKey("elections.id", ondelete="CASCADE"), nullable=False
    )

    # Denormalised chain-side election id for convenient joins/filters.
    blockchain_election_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Indexed vote tally. NOT authoritative.
    vote_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_block: Mapped[int | None] = mapped_column(BigInteger)
    created_tx_hash: Mapped[str | None] = mapped_column(String(66))

    election: Mapped["Election"] = relationship(back_populates="candidates")

    __table_args__ = (
        UniqueConstraint(
            "election_id",
            "blockchain_candidate_id",
            name="uq_candidates_election_chain_id",
        ),
        Index("ix_candidates_election_id", "election_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<Candidate id={self.id} election={self.election_id} "
            f"chain_id={self.blockchain_candidate_id}>"
        )
