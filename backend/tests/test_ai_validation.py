"""Critical validation and false-positive tests for the AI Guardian.

These are the behavioural acceptance tests required by the phase:

* **Critical validation** — a normal election scores low (risk < 30); after a
  500-votes-in-30-seconds burst the risk rises significantly, the threat level
  becomes HIGH or CRITICAL, and the explanation identifies a voting-velocity
  anomaly. Exact scores are deliberately NOT asserted (behaviour, not magic
  numbers, is what matters).
* **False positive** — a legitimate gradual surge near the deadline must remain
  NORMAL/ELEVATED and must NOT be escalated to a human-investigation verdict.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.ai import synthetic
from app.services.ai.guardian import AIGuardian
from app.services.ai.schemas import RECOMMENDATION_HUMAN_INVESTIGATION


def _analyze(db_session: Session, scenario: str, election_id: int) -> dict:
    election = synthetic.ensure_demo_election(
        db_session, blockchain_election_id=election_id, scenario=scenario
    )
    return AIGuardian().analyze_election(db_session, election)


def test_normal_data_scores_low(db_session: Session) -> None:
    result = _analyze(db_session, "normal", 950001)
    assert result["cold_start"] is False
    assert result["risk_score"] < 30, result["risk_score"]
    assert result["threat_level"] == "NORMAL"


def test_burst_injection_escalates_risk(db_session: Session) -> None:
    normal = _analyze(db_session, "normal", 950002)
    burst = _analyze(db_session, "burst", 950003)

    # Risk must rise significantly versus the calm baseline.
    assert burst["risk_score"] > normal["risk_score"] + 25
    assert burst["threat_level"] in {"HIGH", "CRITICAL"}

    # The explanation must be grounded in the actual velocity deviation.
    reasons = " ".join(burst["explanation"]["reasons"]).lower()
    assert "velocity" in reasons
    assert burst["explanation"]["recommendation"] == RECOMMENDATION_HUMAN_INVESTIGATION


def test_burst_raises_a_velocity_alert(db_session: Session) -> None:
    election = synthetic.ensure_demo_election(
        db_session, blockchain_election_id=950004, scenario="burst"
    )
    AIGuardian().analyze_election(db_session, election)

    from app.models.ai_alert import AIAlert
    from app.services.ai.schemas import ALERT_VELOCITY_SPIKE

    types = {
        a.alert_type
        for a in db_session.query(AIAlert).filter_by(election_id=election.id).all()
    }
    assert ALERT_VELOCITY_SPIKE in types


def test_gradual_surge_is_not_a_false_positive(db_session: Session) -> None:
    result = _analyze(db_session, "gradual_surge", 950005)
    # A legitimate ramp may look ELEVATED, but must never be HIGH/CRITICAL and
    # must never recommend human escalation.
    assert result["threat_level"] in {"NORMAL", "ELEVATED"}
    assert result["explanation"]["recommendation"] != RECOMMENDATION_HUMAN_INVESTIGATION
    assert result["risk_score"] < 60


def test_analysis_is_reproducible(db_session: Session) -> None:
    first = _analyze(db_session, "burst", 950006)
    second = _analyze(db_session, "burst", 950006)
    assert first["risk_score"] == second["risk_score"]
    assert first["threat_level"] == second["threat_level"]


def test_peak_risk_needs_multiple_or_sustained_signals(db_session: Session) -> None:
    # A single burst is a strong signal, but the composite request should still
    # trace back to the contributing signals rather than a black box.
    result = _analyze(db_session, "mixed_anomaly", 950007)
    assert result["threat_level"] in {"HIGH", "CRITICAL"}
    top_signals = {c["signal"] for c in result["contributions"] if c["points"] >= 4.0}
    assert len(top_signals) >= 2
