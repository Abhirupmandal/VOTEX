"""AI Election Guardian status endpoint.

The guardian is a SUPERVISORY system: it observes the indexed read model and
raises advisory alerts. No endpoint here can mutate election state, votes, or
results. The status payload is dashboard/SOC-ready.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.ai import GuardianStatusOut
from app.services.ai.guardian import AIGuardian

router = APIRouter(prefix="/guardian", tags=["guardian"])


@router.get(
    "/status",
    response_model=GuardianStatusOut,
    summary="AI Guardian aggregate status",
    description=(
        "Aggregate supervision status: guardian status, latest risk score, "
        "threat level, last analysis time, active alerts, and model version. "
        "Advisory only — the AI never controls election state."
    ),
)
def guardian_status(db: Session = Depends(get_db)) -> dict:
    return AIGuardian().status(db)
