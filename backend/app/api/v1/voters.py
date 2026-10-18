"""Voter read endpoint."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import Pagination, pagination
from app.core.database import get_db
from app.schemas.voter import PaginatedVoters, VoterOut
from app.services.elections import queries

router = APIRouter(prefix="/voters", tags=["voters"])

_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


@router.get(
    "",
    response_model=PaginatedVoters,
    summary="List registered voters",
    description=(
        "Returns a paginated list of registered voters from the indexed read model. "
        "Filterable by active status. Non-authoritative."
    ),
)
def list_voters(
    active: bool | None = Query(None, description="Filter by active status."),
    pag: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> dict:
    page = queries.list_voters(
        db, page=pag.page, page_size=pag.page_size, active=active
    )
    items = [VoterOut.model_validate(v) for v in page.items]
    return {
        "items": items,
        "page": page.page,
        "page_size": page.page_size,
        "total": page.total,
        "pages": page.pages,
        "source": "indexed",
    }



@router.get(
    "/{wallet_address}",
    response_model=VoterOut,
    summary="Get a registered voter by wallet address",
    description=(
        "Returns public registration metadata only (wallet address, opaque "
        "credential commitment, status). No personally identifiable information "
        "is exposed."
    ),
)
def get_voter(wallet_address: str, db: Session = Depends(get_db)) -> object:
    if not _ADDRESS_RE.match(wallet_address):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="wallet_address must be a 0x-prefixed 20-byte hex address.",
        )
    voter = queries.get_voter(db, wallet_address)
    if voter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voter not found.",
        )
    return voter
