"""Security alert engine for the AI Election Guardian.

Turns risk assessments into persisted ``ai_alerts`` rows. Alerts are advisory:
they recommend human investigation and never trigger a blockchain action.

Deduplication strategy
----------------------
Each alert carries a ``dedup_key`` of ``"<election_id>:<alert_type>"``. When a
new observation of the SAME anomaly occurs while a matching alert is still
``OPEN`` or ``ACKNOWLEDGED``, the existing row is updated in place — its
``occurrence_count`` increments, ``last_seen`` advances, and its ``risk_score``
and ``threat_level`` escalate to the higher observed values — rather than
creating an unbounded stream of duplicates. A brand-new row is only created when
no active alert of that type exists (e.g. the previous one was ``RESOLVED``).

Status transitions are constrained to ``OPEN -> ACKNOWLEDGED -> RESOLVED``.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models.ai_alert import AIAlert
from app.models.election import Election
from app.services.ai.schemas import (
    ALERT_COMPOSITE_RISK,
    ALERT_TYPE_BY_SIGNAL,
    SIGNAL_LABELS,
    RiskResult,
    SignalResult,
    WindowFeatures,
)

logger = get_logger("votex.ai.alerts")

# Minimum contribution (points) for a per-signal alert to be raised.
ALERT_POINTS_THRESHOLD = 4.0

# Higher number == more severe, used for escalation comparisons.
_SEVERITY_ORDER = {"NORMAL": 0, "ELEVATED": 1, "HIGH": 2, "CRITICAL": 3}

_ACTIVE_STATUSES = ("OPEN", "ACKNOWLEDGED")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dedup_key(election_id: int, alert_type: str) -> str:
    return f"{election_id}:{alert_type}"


def _find_active(session: Session, election_id: int, alert_type: str) -> AIAlert | None:
    return session.scalar(
        select(AIAlert)
        .where(
            AIAlert.election_id == election_id,
            AIAlert.alert_type == alert_type,
            AIAlert.status.in_(_ACTIVE_STATUSES),
        )
        .order_by(AIAlert.id.desc())
    )


def _upsert_alert(
    session: Session,
    *,
    election_id: int,
    alert_type: str,
    risk: RiskResult,
    features: WindowFeatures,
    model_version: str,
    title: str,
    description: str,
    evidence: dict,
) -> tuple[AIAlert, bool]:
    """Create or escalate a single alert. Returns ``(alert, created)``."""
    existing = _find_active(session, election_id, alert_type)
    now = _now()
    if existing is not None:
        existing.occurrence_count = int(existing.occurrence_count or 0) + 1
        existing.last_seen = now
        existing.window_end = features.window_end
        existing.window_start = existing.window_start or features.window_start
        existing.risk_score = max(int(existing.risk_score or 0), risk.score)
        if _SEVERITY_ORDER.get(risk.threat_level, 0) > _SEVERITY_ORDER.get(
            existing.threat_level, 0
        ):
            existing.threat_level = risk.threat_level
        existing.model_version = model_version
        existing.alert_metadata = evidence
        existing.description = description
        existing.title = title
        logger.info(
            "alert_escalated",
            extra={
                "event": "alert_escalated",
                "election_id": election_id,
                "alert_type": alert_type,
                "risk_score": existing.risk_score,
                "threat_level": existing.threat_level,
                "occurrence_count": existing.occurrence_count,
                "model_version": model_version,
            },
        )
        return existing, False

    alert = AIAlert(
        election_id=election_id,
        risk_score=risk.score,
        threat_level=risk.threat_level,
        alert_type=alert_type,
        title=title,
        description=description,
        status="OPEN",
        dedup_key=_dedup_key(election_id, alert_type),
        occurrence_count=1,
        first_seen=now,
        last_seen=now,
        window_start=features.window_start,
        window_end=features.window_end,
        model_version=model_version,
        alert_metadata=evidence,
    )
    session.add(alert)
    session.flush()
    logger.info(
        "alert_created",
        extra={
            "event": "alert_created",
            "election_id": election_id,
            "alert_type": alert_type,
            "risk_score": risk.score,
            "threat_level": risk.threat_level,
            "model_version": model_version,
        },
    )
    return alert, True


def generate_alerts(
    session: Session,
    election: Election,
    features: WindowFeatures,
    signals: dict[str, SignalResult],
    risk: RiskResult,
    model_version: str,
) -> list[AIAlert]:
    """Create/escalate alerts for a window. No alerts are raised for NORMAL."""
    alerts: list[AIAlert] = []
    if risk.threat_level == "NORMAL":
        return alerts

    by_signal = {c["signal"]: c for c in risk.contributions}
    for signal_name, contribution in by_signal.items():
        alert_type = ALERT_TYPE_BY_SIGNAL.get(signal_name)
        if alert_type is None:
            continue
        signal = signals.get(signal_name)
        if signal is None or not signal.anomalous:
            continue
        if contribution["points"] < ALERT_POINTS_THRESHOLD:
            continue
        label = SIGNAL_LABELS.get(signal_name, signal_name)
        alert, _created = _upsert_alert(
            session,
            election_id=election.id,
            alert_type=alert_type,
            risk=risk,
            features=features,
            model_version=model_version,
            title=f"{label} detected",
            description=signal.detail,
            evidence={
                "signal": signal_name,
                "severity": round(signal.severity, 4),
                "points": contribution["points"],
                "detail": signal.detail,
            },
        )
        alerts.append(alert)

    # Composite alert for HIGH/CRITICAL windows.
    if risk.threat_level in ("HIGH", "CRITICAL"):
        alert, _created = _upsert_alert(
            session,
            election_id=election.id,
            alert_type=ALERT_COMPOSITE_RISK,
            risk=risk,
            features=features,
            model_version=model_version,
            title=f"Composite election risk {risk.score}/100",
            description=(
                f"Combined AI signals produced a {risk.threat_level} risk score. "
                "Human investigation required."
            ),
            evidence={
                "risk_score": risk.score,
                "threat_level": risk.threat_level,
                "top_signals": [
                    c["signal"]
                    for c in risk.contributions
                    if c["points"] >= ALERT_POINTS_THRESHOLD
                ],
            },
        )
        alerts.append(alert)

    return alerts


def acknowledge_alert(session: Session, alert_id: int) -> AIAlert | None:
    """Transition an alert ``OPEN -> ACKNOWLEDGED``."""
    alert = session.get(AIAlert, alert_id)
    if alert is None:
        return None
    if alert.status == "OPEN":
        alert.status = "ACKNOWLEDGED"
        alert.acknowledged_at = _now()
    return alert


def resolve_alert(session: Session, alert_id: int) -> AIAlert | None:
    """Transition an alert ``OPEN|ACKNOWLEDGED -> RESOLVED``."""
    alert = session.get(AIAlert, alert_id)
    if alert is None:
        return None
    if alert.status in _ACTIVE_STATUSES:
        alert.status = "RESOLVED"
        alert.resolved_at = _now()
    return alert


def get_alert(session: Session, alert_id: int) -> AIAlert | None:
    return session.get(AIAlert, alert_id)


def count_active(session: Session, election_id: int | None = None) -> int:
    stmt = select(func.count(AIAlert.id)).where(AIAlert.status.in_(_ACTIVE_STATUSES))
    if election_id is not None:
        stmt = stmt.where(AIAlert.election_id == election_id)
    return int(session.scalar(stmt) or 0)


def list_alerts(
    session: Session,
    *,
    election_id: int,
    page: int,
    page_size: int,
    status: str | None = None,
    threat_level: str | None = None,
):
    """Return a page of alerts with optional status/threat-level filters."""
    from app.services.elections.queries import Page, _paginate

    stmt = select(AIAlert).where(AIAlert.election_id == election_id)
    count_stmt = select(func.count(AIAlert.id)).where(
        AIAlert.election_id == election_id
    )
    if status:
        stmt = stmt.where(AIAlert.status == status.upper())
        count_stmt = count_stmt.where(AIAlert.status == status.upper())
    if threat_level:
        stmt = stmt.where(AIAlert.threat_level == threat_level.upper())
        count_stmt = count_stmt.where(AIAlert.threat_level == threat_level.upper())

    total = int(session.scalar(count_stmt) or 0)
    offset, limit = _paginate(total, page, page_size)
    rows = session.scalars(
        stmt.order_by(AIAlert.detected_at.desc(), AIAlert.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return Page(items=list(rows), page=page, page_size=page_size, total=total)
