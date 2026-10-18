"""Tests for the AI Guardian alert engine.

Exercises generation, deduplication/escalation, status transitions, and
filtered listing against a real (rolled-back) database session. Alerts are
advisory only; these tests also assert that no alert path mutates election
state.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.ai_alert import AIAlert
from app.services.ai import alert_engine, synthetic
from app.services.ai.alert_engine import ALERT_POINTS_THRESHOLD
from app.services.ai.schemas import (
    ALERT_COMPOSITE_RISK,
    ALERT_VELOCITY_SPIKE,
    SIGNAL_VELOCITY,
    RiskResult,
    SignalResult,
    WindowFeatures,
    threat_level_for,
)

MODEL_VERSION = "0.1.0"


def _risk(score: int, *, points: float = 20.0) -> RiskResult:
    return RiskResult(
        score=score,
        threat_level=threat_level_for(score),
        contributions=[
            {
                "signal": SIGNAL_VELOCITY,
                "label": "Voting velocity anomaly",
                "weight": 0.25,
                "severity": 0.8,
                "points": points,
                "anomalous": True,
                "detail": "Voting velocity spiked.",
            }
        ],
    )


def _signals(*, anomalous: bool = True) -> dict[str, SignalResult]:
    return {
        SIGNAL_VELOCITY: SignalResult(
            name=SIGNAL_VELOCITY,
            anomalous=anomalous,
            severity=0.8,
            detail="Voting velocity is 4.20σ from the rolling baseline.",
        )
    }


def _features(election_id: int) -> WindowFeatures:
    return WindowFeatures(election_id=election_id, window_start=0, window_end=300)


def _demo(db_session: Session, election_id: int = 920001):
    return synthetic.ensure_demo_election(
        db_session, blockchain_election_id=election_id, scenario="normal"
    )


def test_normal_risk_creates_no_alerts(db_session: Session) -> None:
    election = _demo(db_session)
    alerts = alert_engine.generate_alerts(
        db_session,
        election,
        _features(election.id),
        _signals(),
        _risk(10),
        MODEL_VERSION,
    )
    assert alerts == []


def test_per_signal_alert_is_created(db_session: Session) -> None:
    election = _demo(db_session)
    alerts = alert_engine.generate_alerts(
        db_session,
        election,
        _features(election.id),
        _signals(),
        _risk(65),
        MODEL_VERSION,
    )
    types = {a.alert_type for a in alerts}
    assert ALERT_VELOCITY_SPIKE in types
    # HIGH risk also raises a composite alert.
    assert ALERT_COMPOSITE_RISK in types


def test_alert_below_points_threshold_is_skipped(db_session: Session) -> None:
    election = _demo(db_session)
    alerts = alert_engine.generate_alerts(
        db_session,
        election,
        _features(election.id),
        _signals(),
        _risk(65, points=ALERT_POINTS_THRESHOLD - 1.0),
        MODEL_VERSION,
    )
    assert all(a.alert_type != ALERT_VELOCITY_SPIKE for a in alerts)
    # The composite alert is still raised for a HIGH window.
    assert any(a.alert_type == ALERT_COMPOSITE_RISK for a in alerts)


def test_repeated_observations_are_deduplicated(db_session: Session) -> None:
    election = _demo(db_session)
    features = _features(election.id)
    risk = _risk(70)

    first = alert_engine.generate_alerts(
        db_session, election, features, _signals(), risk, MODEL_VERSION
    )
    db_session.flush()
    second = alert_engine.generate_alerts(
        db_session, election, features, _signals(), risk, MODEL_VERSION
    )
    db_session.flush()

    # Same alert objects are escalated, not duplicated.
    assert {a.id for a in first} == {a.id for a in second}
    velocity = next(a for a in second if a.alert_type == ALERT_VELOCITY_SPIKE)
    assert velocity.occurrence_count == 2
    assert velocity.status == "OPEN"

    total = db_session.query(AIAlert).filter_by(election_id=election.id).count()
    assert total == len(first)


def test_escalation_raises_threat_level(db_session: Session) -> None:
    election = _demo(db_session)
    features = _features(election.id)

    alert_engine.generate_alerts(
        db_session, election, features, _signals(), _risk(65), MODEL_VERSION
    )
    db_session.flush()
    escalated = alert_engine.generate_alerts(
        db_session, election, features, _signals(), _risk(90), MODEL_VERSION
    )
    db_session.flush()

    velocity = next(a for a in escalated if a.alert_type == ALERT_VELOCITY_SPIKE)
    assert velocity.threat_level == "CRITICAL"
    assert velocity.risk_score == 90


def test_acknowledge_then_resolve_transitions(db_session: Session) -> None:
    election = _demo(db_session)
    alerts = alert_engine.generate_alerts(
        db_session,
        election,
        _features(election.id),
        _signals(),
        _risk(65),
        MODEL_VERSION,
    )
    db_session.commit()
    alert_id = alerts[0].id

    acked = alert_engine.acknowledge_alert(db_session, alert_id)
    assert acked is not None
    assert acked.status == "ACKNOWLEDGED"
    assert acked.acknowledged_at is not None

    resolved = alert_engine.resolve_alert(db_session, alert_id)
    assert resolved is not None
    assert resolved.status == "RESOLVED"
    assert resolved.resolved_at is not None


def test_resolved_alert_allows_a_new_row(db_session: Session) -> None:
    election = _demo(db_session)
    features = _features(election.id)
    alert_engine.generate_alerts(
        db_session, election, features, _signals(), _risk(65), MODEL_VERSION
    )
    db_session.flush()
    active = alert_engine._find_active(db_session, election.id, ALERT_VELOCITY_SPIKE)
    assert active is not None
    alert_engine.resolve_alert(db_session, active.id)
    db_session.flush()

    recreated = alert_engine.generate_alerts(
        db_session, election, features, _signals(), _risk(65), MODEL_VERSION
    )
    db_session.flush()
    rows = db_session.query(AIAlert).filter_by(
        election_id=election.id, alert_type=ALERT_VELOCITY_SPIKE
    ).all()
    assert len(rows) == 2
    assert any(a.id != active.id for a in recreated)


def test_count_active_and_list_filters(db_session: Session) -> None:
    election = _demo(db_session)
    alerts = alert_engine.generate_alerts(
        db_session,
        election,
        _features(election.id),
        _signals(),
        _risk(70),
        MODEL_VERSION,
    )
    db_session.commit()
    assert alert_engine.count_active(db_session, election.id) == len(alerts)

    page = alert_engine.list_alerts(
        db_session, election_id=election.id, page=1, page_size=10, status="OPEN"
    )
    assert page.total == len(alerts)
    assert all(item.status == "OPEN" for item in page.items)

    filtered = alert_engine.list_alerts(
        db_session,
        election_id=election.id,
        page=1,
        page_size=10,
        threat_level="HIGH",
    )
    assert all(item.threat_level == "HIGH" for item in filtered.items)

    empty = alert_engine.list_alerts(
        db_session,
        election_id=election.id,
        page=1,
        page_size=10,
        status="ACKNOWLEDGED",
    )
    assert empty.total == 0


def test_get_alert_missing_returns_none(db_session: Session) -> None:
    assert alert_engine.get_alert(db_session, 999_999) is None


def test_alert_creation_does_not_mutate_election(db_session: Session) -> None:
    election = _demo(db_session)
    before_votes = election.total_votes
    before_state = election.state

    alert_engine.generate_alerts(
        db_session,
        election,
        _features(election.id),
        _signals(),
        _risk(90),
        MODEL_VERSION,
    )
    db_session.commit()
    db_session.refresh(election)
    assert election.total_votes == before_votes
    assert election.state == before_state
