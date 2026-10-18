"""Audit explorer queries over indexed blockchain events."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.blockchain_event import BlockchainEvent
from app.services.elections.queries import Page, _paginate


def list_events(
    session: Session,
    page: int,
    page_size: int,
    event_type: str | None = None,
    contract_address: str | None = None,
    election_id: int | None = None,
) -> Page:
    """Return a page of indexed events, newest first."""
    stmt = select(BlockchainEvent)
    count_stmt = select(func.count(BlockchainEvent.id))

    if event_type:
        stmt = stmt.where(BlockchainEvent.event_type == event_type)
        count_stmt = count_stmt.where(BlockchainEvent.event_type == event_type)
    if contract_address:
        addr = contract_address.lower()
        stmt = stmt.where(BlockchainEvent.contract_address == addr)
        count_stmt = count_stmt.where(BlockchainEvent.contract_address == addr)

    total = int(session.scalar(count_stmt) or 0)
    offset, limit = _paginate(total, page, page_size)
    rows = session.scalars(
        stmt.order_by(
            BlockchainEvent.block_number.desc(), BlockchainEvent.log_index.desc()
        )
        .offset(offset)
        .limit(limit)
    ).all()

    # Optional in-memory filter by election id (payload is JSON).
    items = list(rows)
    if election_id is not None:
        items = [
            e
            for e in items
            if str((e.payload or {}).get("electionId")) == str(election_id)
        ]

    return Page(items=items, page=page, page_size=page_size, total=total)


def get_transaction_events(
    session: Session, transaction_hash: str
) -> list[BlockchainEvent]:
    """Return every indexed event belonging to a transaction, ordered by log."""
    return list(
        session.scalars(
            select(BlockchainEvent)
            .where(BlockchainEvent.transaction_hash == transaction_hash.lower())
            .order_by(BlockchainEvent.log_index)
        ).all()
    )
