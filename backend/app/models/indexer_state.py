"""Indexer synchronization state (checkpoint) table.

Supports resumable and reorg-aware indexing: the indexer persists the last
fully-processed block together with its hash so it can detect a discontinuity
and rewind if a reorganization has occurred.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class IndexerState(Base):
    """Persisted checkpoint for a single logical indexer stream."""

    __tablename__ = "indexer_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Identity of the indexed stream: network + contract + start block.
    network: Mapped[str] = mapped_column(String(64), nullable=False)
    contract_address: Mapped[str] = mapped_column(String(42), nullable=False)
    indexer_key: Mapped[str] = mapped_column(String(128), nullable=False)

    last_processed_block: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0
    )
    last_processed_block_hash: Mapped[str | None] = mapped_column(String(66))

    # Total number of events persisted by this stream (diagnostics only).
    events_indexed: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    # e.g. "IDLE", "SYNCING", "CONTINUOUS", "REORG_DETECTED", "ERROR".
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="IDLE")

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("indexer_key", name="uq_indexer_state_key"),
        Index("ix_indexer_state_network", "network"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<IndexerState key={self.indexer_key} "
            f"block={self.last_processed_block} status={self.status}>"
        )
