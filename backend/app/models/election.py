"""Election read-model table.

This is an OFF-CHAIN INDEXED VIEW of on-chain election configuration. The
blockchain remains authoritative for election state, eligibility, and results.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.candidate import Candidate
    from app.models.vote import Vote


class Election(Base):
    """Indexed representation of a deployed VOTEX election."""

    __tablename__ = "elections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # The on-chain election id. Unique so re-indexing can never duplicate rows.
    blockchain_election_id: Mapped[int] = mapped_column(
        BigInteger, nullable=False, unique=True, index=True
    )

    # Address of the per-election ElectionInstance contract (set from factory).
    contract_address: Mapped[str | None] = mapped_column(String(42), index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    registration_start: Mapped[int | None] = mapped_column(BigInteger)
    registration_end: Mapped[int | None] = mapped_column(BigInteger)
    voting_start: Mapped[int | None] = mapped_column(BigInteger)
    voting_end: Mapped[int | None] = mapped_column(BigInteger)

    # Latest indexed lifecycle state (enum name, e.g. "ACTIVE").
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT")
    state_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Indexed tallies. NOT authoritative — blockchain results are.
    total_votes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    total_registered_voters: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0
    )

    creator: Mapped[str | None] = mapped_column(String(42))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    created_block: Mapped[int | None] = mapped_column(BigInteger)
    created_tx_hash: Mapped[str | None] = mapped_column(String(66), index=True)

    candidates: Mapped[list["Candidate"]] = relationship(
        back_populates="election",
        cascade="all, delete-orphan",
        order_by="Candidate.blockchain_candidate_id",
    )
    votes: Mapped[list["Vote"]] = relationship(
        back_populates="election", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_elections_state", "state"),
        Index("ix_elections_created_block", "created_block"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<Election id={self.id} chain_id={self.blockchain_election_id} "
            f"state={self.state}>"
        )
