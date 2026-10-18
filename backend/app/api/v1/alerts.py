"""AI security alert endpoints.

Alerts are advisory observations produced by the AI Election Guardian. They can
be acknowledged or resolved by a human operator, but acknowledging or resolving
an alert never changes election state, votes, or results.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import Pagination, pagination
from app.core.database import get_db
from app.schemas.ai import AIAlertOut, PaginatedAlerts
from app.services.ai import alert_engine
from app.services.elections import queries

router = APIRouter(tags=["alerts"])


@router.get(
    "/elections/{election_id}/alerts",
    response_model=PaginatedAlerts,
    summary="List AI alerts for an election",
    description=(
        "Paginated supervisory alerts for an election, filterable by status "
        "(OPEN/ACKNOWLEDGED/RESOLVED) and threat level "
        "(NORMAL/ELEVATED/HIGH/CRITICAL). AI alerts never prove fraud."
    ),
)
def list_alerts(
    election_id: int,
    alert_status: str | None = Query(
        None,
        alias="status",
        description="Filter by alert status (OPEN/ACKNOWLEDGED/RESOLVED).",
    ),
    threat_level: str | None = Query(
        None, description="Filter by threat level (NORMAL/ELEVATED/HIGH/CRITICAL)."
    ),
    pag: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> dict:
    election = queries.get_election(db, election_id)
    if election is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Election {election_id} not found.",
        )
    page = alert_engine.list_alerts(
        db,
        election_id=election.id,
        page=pag.page,
        page_size=pag.page_size,
        status=alert_status,
        threat_level=threat_level,
    )
    items = [AIAlertOut.model_validate(a) for a in page.items]
    return {
        "items": items,
        "page": page.page,
        "page_size": page.page_size,
        "total": page.total,
        "pages": page.pages,
        "source": "indexed",
    }


@router.get(
    "/alerts/{alert_id}",
    response_model=AIAlertOut,
    summary="Get a single AI alert",
)
def get_alert(alert_id: int, db: Session = Depends(get_db)) -> object:
    alert = alert_engine.get_alert(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert {alert_id} not found.",
        )
    return alert


@router.post(
    "/alerts/{alert_id}/acknowledge",
    response_model=AIAlertOut,
    summary="Acknowledge an AI alert (human action)",
    description=(
        "Marks an OPEN alert as ACKNOWLEDGED. This is a record-keeping action "
        "only and does not affect election state, votes, or results."
    ),
)
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)) -> object:
    alert = alert_engine.acknowledge_alert(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert {alert_id} not found.",
        )
    db.commit()
    return alert


@router.post(
    "/alerts/{alert_id}/resolve",
    response_model=AIAlertOut,
    summary="Resolve an AI alert (human action)",
    description=(
        "Marks an active alert as RESOLVED. Record-keeping only; it does not "
        "affect election state, votes, or results."
    ),
)
def resolve_alert(alert_id: int, db: Session = Depends(get_db)) -> object:
    alert = alert_engine.resolve_alert(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert {alert_id} not found.",
        )
    db.commit()
    return alert
