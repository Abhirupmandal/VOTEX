"""Voter read-model table.

Stores ONLY public identifiers and the opaque credential commitment that is
already public on-chain. No personally identifiable information is persisted.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Voter(Base):
    """Indexed representation of an on-chain voter registration."""

    __tablename__ = "voters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Wallet addresses are normalised to lowercase before storage.
    wallet_address: Mapped[str] = mapped_column(
        String(42), nullable=False, unique=True, index=True
    )

    credential_commitment: Mapped[str | None] = mapped_column(String(66))

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    registered_at: Mapped[int | None] = mapped_column(BigInteger)
    registered_block: Mapped[int | None] = mapped_column(BigInteger, index=True)
    registered_tx_hash: Mapped[str | None] = mapped_column(String(66), index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (Index("ix_voters_active", "active"),)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Voter wallet={self.wallet_address} active={self.active}>"
