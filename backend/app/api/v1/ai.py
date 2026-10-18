"""Election-scoped AI Guardian endpoints: risk, features, and on-demand analysis.

All responses are SUPERVISORY. The analysis endpoint reads the indexed read
model, computes features, runs the detectors, scores risk, explains the result,
persists an assessment, and raises advisory alerts — it has no code path that
writes to the blockchain or mutates election state, votes, or results.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.ai_feature_snapshot import AIFeatureSnapshot
from app.schemas.ai import AIAnalysisOut, AIFeaturesOut, AIRiskOut
from app.services.ai.guardian import AIGuardian
from app.services.elections import queries

router = APIRouter(prefix="/elections", tags=["ai-guardian"])


@router.get(
    "/{election_id}/risk",
    response_model=AIRiskOut,
    summary="Latest AI supervision risk for an election",
    description=(
        "Returns the most recent persisted AI risk assessment (score, threat "
        "level, guardian status, signals, explanation). If no analysis exists "
        "yet the election reports CALIBRATING at score 0. Advisory only."
    ),
)
def election_risk(election_id: int, db: Session = Depends(get_db)) -> dict:
    election = queries.get_election(db, election_id)
    if election is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Election {election_id} not found.",
        )
    return AIGuardian().election_risk(db, election)


@router.get(
    "/{election_id}/ai/features",
    response_model=AIFeaturesOut,
    summary="Persisted AI feature snapshots for an election",
    description=(
        "Engineered behavioural features per analysis window (velocity, "
        "inter-arrival, entropy, unique voters, gas). Derived from the indexed "
        "read model and reproducible for audit."
    ),
)
def election_features(
    election_id: int,
    limit: int = Query(50, ge=1, le=500, description="Most recent windows to return."),
    db: Session = Depends(get_db),
) -> dict:
    election = queries.get_election(db, election_id)
    if election is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Election {election_id} not found.",
        )
    settings = get_settings()
    total = int(
        db.scalar(
            select(func.count(AIFeatureSnapshot.id)).where(
                AIFeatureSnapshot.election_id == election.id
            )
        )
        or 0
    )
    rows = db.scalars(
        select(AIFeatureSnapshot)
        .where(AIFeatureSnapshot.election_id == election.id)
        .order_by(AIFeatureSnapshot.window_end.desc(), AIFeatureSnapshot.id.desc())
        .limit(limit)
    ).all()
    return {
        "election_id": election.blockchain_election_id,
        "count": len(rows),
        "observations": total,
        "calibrating": total < settings.ai_cold_start_min_observations,
        "model_version": AIGuardian(settings=settings).model_version,
        "items": list(reversed(rows)),
    }


@router.post(
    "/{election_id}/ai/analyze",
    response_model=AIAnalysisOut,
    summary="Run an on-demand AI analysis for an election",
    description=(
        "Collects telemetry, engineers features, runs the statistical and "
        "Isolation Forest detectors, computes a bounded 0-100 risk score, "
        "explains it, persists the assessment, and raises advisory alerts. "
        "This is a READ-ONLY analysis: it never modifies election state, votes, "
        "candidate totals, or results."
    ),
)
def analyze_election(election_id: int, db: Session = Depends(get_db)) -> dict:
    election = queries.get_election(db, election_id)
    if election is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Election {election_id} not found.",
        )
    return AIGuardian().analyze_election(db, election)
