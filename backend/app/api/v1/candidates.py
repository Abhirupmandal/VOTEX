"""Candidate read endpoints (nested under an election)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.candidate import CandidateOut
from app.services.elections import queries

router = APIRouter(prefix="/elections", tags=["candidates"])


@router.get(
    "/{election_id}/candidates",
    response_model=list[CandidateOut],
    summary="List candidates for an election",
)
def list_candidates(election_id: int, db: Session = Depends(get_db)) -> list:
    election = queries.get_election(db, election_id)
    if election is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Election {election_id} not found.",
        )
    return queries.list_candidates(db, election)


@router.get(
    "/{election_id}/candidates/{candidate_id}",
    response_model=CandidateOut,
    summary="Get a single candidate",
)
def get_candidate(
    election_id: int, candidate_id: int, db: Session = Depends(get_db)
) -> object:
    election = queries.get_election(db, election_id)
    if election is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Election {election_id} not found.",
        )
    candidate = queries.get_candidate(db, election, candidate_id)
    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate {candidate_id} not found in election {election_id}.",
        )
    return candidate
