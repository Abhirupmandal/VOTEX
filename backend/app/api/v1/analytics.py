"""Indexed analytics endpoint (nested under an election)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.audit import AnalyticsOut
from app.services.elections import analytics, queries

router = APIRouter(prefix="/elections", tags=["analytics"])


@router.get(
    "/{election_id}/analytics",
    response_model=AnalyticsOut,
    summary="Indexed analytics for an election",
    description=(
        "OFF-CHAIN INDEXED VIEW: total votes, registered voters, turnout, "
        "votes by candidate, and voting activity over time. Non-authoritative."
    ),
)
def get_analytics(election_id: int, db: Session = Depends(get_db)) -> dict:
    election = queries.get_election(db, election_id)
    if election is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Election {election_id} not found.",
        )
    return analytics.build_analytics(db, election)
