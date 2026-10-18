"""Raw indexed blockchain event table.

Every decoded (or undecodable) log is persisted here before/alongside read-model
projection. The unique tuple (transaction_hash, log_index) makes indexing
idempotent and provides a complete audit trail.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Index,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class BlockchainEvent(Base):
    """A single decoded on-chain log."""

    __tablename__ = "blockchain_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    contract_address: Mapped[str] = mapped_column(String(42), nullable=False, index=True)

    transaction_hash: Mapped[str] = mapped_column(String(66), nullable=False, index=True)
    block_number: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    block_hash: Mapped[str | None] = mapped_column(String(66))
    transaction_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    log_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # Decoded arguments + block metadata as JSON for rich auditing.
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # On-chain block timestamp when available.
    timestamp: Mapped[int | None] = mapped_column(BigInteger, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # Critical idempotency constraint.
        UniqueConstraint(
            "transaction_hash", "log_index", name="uq_events_tx_log"
        ),
        Index("ix_events_block_log", "block_number", "log_index"),
        Index(
            "ix_events_contract_block", "contract_address", "block_number"
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<BlockchainEvent {self.event_type} block={self.block_number} "
            f"tx={self.transaction_hash} log={self.log_index}>"
        )
