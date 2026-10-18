"""Vote read endpoint (paginated), nested under an election."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import Pagination, pagination
from app.core.database import get_db
from app.schemas.vote import PaginatedVotes, VoteOut
from app.services.elections import queries

router = APIRouter(prefix="/elections", tags=["votes"])


@router.get(
    "/{election_id}/votes",
    response_model=PaginatedVotes,
    summary="List indexed votes for an election (paginated)",
    description=(
        "Returns indexed VoteCast events. This is an OFF-CHAIN INDEXED VIEW and "
        "is not the authoritative vote count."
    ),
)
def list_votes(
    election_id: int,
    pag: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> dict:
    election = queries.get_election(db, election_id)
    if election is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Election {election_id} not found.",
        )
    page = queries.list_votes(db, election, pag.page, pag.page_size)
    items = [VoteOut.model_validate(v) for v in page.items]
    return {
        "items": items,
        "page": page.page,
        "page_size": page.page_size,
        "total": page.total,
        "pages": page.pages,
        "source": "OFF-CHAIN INDEXED VIEW",
    }
