"""Vote read-model table.

This table is an INDEXED REPRESENTATION of on-chain VoteCast events. It is NOT
the authoritative vote count — that lives on the blockchain. The unique tuple
(transaction_hash, log_index) guarantees idempotent indexing.
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
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.election import Election


class Vote(Base):
    """Indexed representation of a single on-chain vote."""

    __tablename__ = "votes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    election_id: Mapped[int] = mapped_column(
        ForeignKey("elections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    blockchain_election_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    candidate_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    blockchain_candidate_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    voter_address: Mapped[str] = mapped_column(String(42), nullable=False, index=True)

    block_number: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    transaction_hash: Mapped[str] = mapped_column(String(66), nullable=False, index=True)
    transaction_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    log_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    timestamp: Mapped[int | None] = mapped_column(BigInteger)
    gas_used: Mapped[int | None] = mapped_column(BigInteger)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    election: Mapped["Election"] = relationship(back_populates="votes")

    __table_args__ = (
        # Idempotency guard: one row per on-chain event.
        UniqueConstraint(
            "transaction_hash", "log_index", name="uq_votes_tx_log"
        ),
        Index("ix_votes_election_block", "election_id", "block_number"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<Vote election={self.blockchain_election_id} "
            f"candidate={self.blockchain_candidate_id} tx={self.transaction_hash}>"
        )
