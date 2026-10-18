"""Audit explorer endpoints over indexed blockchain events."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import Pagination, pagination
from app.core.database import get_db
from app.schemas.audit import AuditEventOut, PaginatedAuditEvents
from app.services.audit import queries

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get(
    "/events",
    response_model=PaginatedAuditEvents,
    summary="List indexed blockchain events",
    description=(
        "Paginated audit trail of indexed on-chain events. Optionally filter by "
        "event_type, contract_address, or election_id."
    ),
)
def list_events(
    event_type: str | None = Query(None, description="Filter by event type."),
    contract_address: str | None = Query(
        None, description="Filter by emitting contract address."
    ),
    election_id: int | None = Query(None, description="Filter by election id."),
    pag: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> dict:
    page = queries.list_events(
        db,
        pag.page,
        pag.page_size,
        event_type=event_type,
        contract_address=contract_address,
        election_id=election_id,
    )
    items = [AuditEventOut.model_validate(e) for e in page.items]
    return {
        "items": items,
        "page": page.page,
        "page_size": page.page_size,
        "total": page.total,
        "pages": page.pages,
        "source": "OFF-CHAIN INDEXED VIEW",
    }


@router.get(
    "/transactions/{transaction_hash}",
    response_model=list[AuditEventOut],
    summary="Look up indexed events by transaction hash",
)
def get_transaction(
    transaction_hash: str, db: Session = Depends(get_db)
) -> list:
    if not transaction_hash.startswith("0x") or len(transaction_hash) != 66:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="transaction_hash must be a 0x-prefixed 32-byte hex value.",
        )
    events = queries.get_transaction_events(db, transaction_hash)
    if not events:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No indexed events for this transaction hash.",
        )
    return events
