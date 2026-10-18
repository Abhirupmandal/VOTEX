"""Election read endpoints (list, detail, results)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import Pagination, pagination
from app.core.database import get_db
from app.core.logging import get_logger
from app.schemas.election import ElectionSummary, PaginatedElections
from app.services.elections import queries, verification

router = APIRouter(prefix="/elections", tags=["elections"])
logger = get_logger("votex.api.elections")


@router.get(
    "",
    response_model=PaginatedElections,
    summary="List indexed elections",
    description="Paginated list of elections. Response labelled OFF-CHAIN INDEXED VIEW.",
)
def list_elections(
    state: str | None = Query(None, description="Optional lifecycle state filter."),
    pag: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> dict:
    page = queries.list_elections(db, pag.page, pag.page_size, state=state)
    items = [ElectionSummary.model_validate(row) for row in page.items]
    return {
        "items": items,
        "page": page.page,
        "page_size": page.page_size,
        "total": page.total,
        "pages": page.pages,
        "source": "OFF-CHAIN INDEXED VIEW",
    }


@router.get(
    "/{election_id}",
    summary="Get an indexed election",
    description="Returns a single election by its on-chain election id.",
)
def get_election(election_id: int, db: Session = Depends(get_db)) -> dict:
    election = queries.get_election(db, election_id)
    if election is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Election {election_id} not found.",
        )
    return {
        "id": election.id,
        "blockchain_election_id": election.blockchain_election_id,
        "title": election.title,
        "description": election.description,
        "registration_start": election.registration_start,
        "registration_end": election.registration_end,
        "voting_start": election.voting_start,
        "voting_end": election.voting_end,
        "state": election.state,
        "state_index": election.state_index,
        "total_votes": election.total_votes,
        "total_registered_voters": election.total_registered_voters,
        "contract_address": election.contract_address,
        "creator": election.creator,
        "created_block": election.created_block,
        "created_tx_hash": election.created_tx_hash,
        "created_at": election.created_at,
        "updated_at": election.updated_at,
        "source": "OFF-CHAIN INDEXED VIEW",
    }


@router.get(
    "/{election_id}/results",
    summary="Dual-source election results with verification",
    description=(
        "Returns the OFF-CHAIN INDEXED result alongside the authoritative "
        "BLOCKCHAIN result and an explicit comparison. Divergence sets "
        "verification.matches=false; results are never silently reconciled."
    ),
)
def election_results(election_id: int, db: Session = Depends(get_db)) -> dict:
    election = queries.get_election(db, election_id)
    if election is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Election {election_id} not found.",
        )
    return verification.verify_election(db, election)
