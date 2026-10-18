"""Tests for the AI Guardian orchestrator: pipeline, cold start, and status.

These tests also pin the SUPERVISORY safety boundary: analysis never mutates
election state, vote totals, or candidate tallies.
"""

from __future__ import annotations

import threading

from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.election import Election
from app.models.vote import Vote
from app.services.ai import synthetic
from app.services.ai.guardian import (
    AIGuardian,
    PeriodicAnalyzer,
    guardian_summary_from_assessments,
)
from app.services.ai.schemas import (
    AI_GUARDIAN_VERSION,
    STATUS_CALIBRATING,
    STATUS_MONITORING,
    STATUS_OFFLINE,
    SUPERVISORY_ONLY,
)


def _tiny_election(session: Session, blockchain_election_id: int = 930001) -> Election:
    """An election with too few windows to leave cold start (1 observation)."""
    election = Election(
        blockchain_election_id=blockchain_election_id,
        title="Tiny cold-start election",
        description="TEST/DEMO DATA",
        state="ACTIVE",
        state_index=2,
        voting_start=1_700_000_000,
        voting_end=1_700_000_060,
        total_votes=3,
        total_registered_voters=3,
        creator="0x" + "00" * 20,
    )
    session.add(election)
    session.flush()
    session.add(
        Candidate(
            election_id=election.id,
            blockchain_election_id=blockchain_election_id,
            blockchain_candidate_id=1,
            name="Alice",
            vote_count=3,
            active=True,
        )
    )
    for i in range(3):
        session.add(
            Vote(
                election_id=election.id,
                blockchain_election_id=blockchain_election_id,
                candidate_id=1,
                blockchain_candidate_id=1,
                voter_address="0x" + f"{i:040x}",
                block_number=1_700_000_000 + i,
                transaction_hash="0x" + f"{i:064x}",
                timestamp=1_700_000_000 + i,
                gas_used=21000,
            )
        )
    session.commit()
    session.refresh(election)
    return election


def _normal_election(session: Session, blockchain_election_id: int = 930002) -> Election:
    return synthetic.ensure_demo_election(
        session, blockchain_election_id=blockchain_election_id, scenario="normal"
    )


# -- Cold start -------------------------------------------------------------


def test_cold_start_reports_calibrating(db_session: Session) -> None:
    election = _tiny_election(db_session)
    result = AIGuardian().analyze_election(db_session, election)

    assert result["cold_start"] is True
    assert result["guardian_status"] == STATUS_CALIBRATING
    assert result["observations"] < 10


def test_cold_start_persists_assessment_without_alerts(db_session: Session) -> None:
    election = _tiny_election(db_session, blockchain_election_id=930011)
    guardian = AIGuardian()
    result = guardian.analyze_election(db_session, election)
    assert result["alerts_created"] == 0

    assessment = guardian.latest_assessment(db_session, election)
    assert assessment is not None
    assert assessment.guardian_status == STATUS_CALIBRATING
    assert assessment.model_version == AI_GUARDIAN_VERSION


# -- Full pipeline ----------------------------------------------------------


def test_normal_pipeline_exits_cold_start(db_session: Session) -> None:
    election = _normal_election(db_session)
    result = AIGuardian().analyze_election(db_session, election)

    assert result["cold_start"] is False
    assert result["observations"] >= 10
    assert result["guardian_status"] in {STATUS_MONITORING, "ELEVATED"}
    assert result["threat_level"] in {"NORMAL", "ELEVATED"}


def test_analysis_result_shape_and_version(db_session: Session) -> None:
    election = _normal_election(db_session, blockchain_election_id=930012)
    result = AIGuardian().analyze_election(db_session, election)

    for key in (
        "election_id",
        "risk_score",
        "threat_level",
        "guardian_status",
        "signals",
        "contributions",
        "explanation",
        "features",
        "model_version",
        "observations",
    ):
        assert key in result
    assert result["model_version"] == AI_GUARDIAN_VERSION
    assert 0 <= result["risk_score"] <= 100
    assert result["explanation"]["disclaimer"]


def test_analysis_persists_feature_snapshots(db_session: Session) -> None:
    election = _normal_election(db_session, blockchain_election_id=930013)
    guardian = AIGuardian()
    guardian.analyze_election(db_session, election)

    assessment = guardian.latest_assessment(db_session, election)
    assert assessment is not None
    assert assessment.feature_snapshot_id is not None
    assert assessment.signals


def test_analysis_does_not_mutate_election_or_tallies(db_session: Session) -> None:
    election = _normal_election(db_session, blockchain_election_id=930014)
    before_votes = election.total_votes
    before_state = election.state
    tallies_before = {
        c.blockchain_candidate_id: c.vote_count for c in election.candidates
    }

    AIGuardian().analyze_election(db_session, election)
    db_session.refresh(election)

    assert election.total_votes == before_votes
    assert election.state == before_state
    tallies_after = {
        c.blockchain_candidate_id: c.vote_count for c in election.candidates
    }
    assert tallies_after == tallies_before


# -- Read helpers -----------------------------------------------------------


def test_election_risk_is_neutral_without_assessment(db_session: Session) -> None:
    election = _tiny_election(db_session, blockchain_election_id=930015)
    payload = AIGuardian().election_risk(db_session, election)
    assert payload["risk_score"] == 0
    assert payload["threat_level"] == "NORMAL"
    assert payload["guardian_status"] == STATUS_CALIBRATING
    assert payload["actionable"] is False


def test_election_risk_reflects_latest_assessment(db_session: Session) -> None:
    election = _normal_election(db_session, blockchain_election_id=930016)
    AIGuardian().analyze_election(db_session, election)
    payload = AIGuardian().election_risk(db_session, election)
    assert payload["model_version"] == AI_GUARDIAN_VERSION
    assert payload["analyzed_at"] is not None
    assert "active_alerts" in payload


def test_status_offline_when_no_elections(db_session: Session) -> None:
    payload = AIGuardian().status(db_session)
    assert payload["status"] == STATUS_OFFLINE
    assert payload["elections_monitored"] == 0


def test_status_calibrating_when_no_assessments(db_session: Session) -> None:
    _tiny_election(db_session, blockchain_election_id=930017)
    payload = AIGuardian().status(db_session)
    assert payload["status"] == STATUS_CALIBRATING
    assert payload["elections_monitored"] == 1


def test_run_analysis_processes_all_elections(db_session: Session) -> None:
    _normal_election(db_session, blockchain_election_id=930018)
    results = AIGuardian().run_analysis(db_session)
    assert len(results) == 1
    assert results[0]["election_id"] == 930018


# -- Worker -----------------------------------------------------------------


class _StubGuardian:
    """Records calls without touching the database."""

    def __init__(self) -> None:
        self.calls = 0

    def run_analysis(self, session) -> list[dict]:  # noqa: ANN001
        self.calls += 1
        return []


def test_periodic_analyzer_starts_and_stops_cleanly() -> None:
    stub = _StubGuardian()
    worker = PeriodicAnalyzer(interval=0.01, guardian=stub)  # type: ignore[arg-type]
    worker.start()
    assert worker._thread is not None and worker._thread.is_alive()
    worker.stop(timeout=5.0)
    assert worker._thread is None
    assert stub.calls >= 1


def test_periodic_analyzer_start_is_idempotent() -> None:
    stub = _StubGuardian()
    worker = PeriodicAnalyzer(interval=1.0, guardian=stub)  # type: ignore[arg-type]
    worker.start()
    thread = worker._thread
    worker.start()
    assert worker._thread is thread
    worker.stop(timeout=5.0)


# -- Safety boundary --------------------------------------------------------


def test_supervisory_only_flag_is_set() -> None:
    assert SUPERVISORY_ONLY is True


def test_guardian_exposes_no_blockchain_write_operations() -> None:
    for forbidden in (
        "cast_vote",
        "pause_election",
        "finalize_election",
        "grant_role",
        "set_state",
        "declare_winner",
    ):
        assert not hasattr(AIGuardian, forbidden)


def test_guardian_summary_folds_assessments() -> None:
    summary = guardian_summary_from_assessments(
        [
            {
                "risk_score": 20,
                "threat_level": "NORMAL",
                "guardian_status": STATUS_MONITORING,
                "alerts_created": 0,
            },
            {
                "risk_score": 90,
                "threat_level": "CRITICAL",
                "guardian_status": "CRITICAL",
                "alerts_created": 3,
            },
        ]
    )
    assert summary["risk_score"] == 90
    assert summary["status"] == "CRITICAL"
    assert summary["active_alerts"] == 3

    empty = guardian_summary_from_assessments([])
    assert empty["status"] == STATUS_OFFLINE
