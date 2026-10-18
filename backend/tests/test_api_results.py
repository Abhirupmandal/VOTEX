"""API-level tests for the dual-source results endpoint."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.main import app
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.vote import Vote
from app.services.elections import verification


@pytest.fixture()
def api_client(client: TestClient, db_session: Session):
    def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


def _seed(session: Session) -> None:
    election = Election(
        blockchain_election_id=1,
        title="E",
        state="ENDED",
        state_index=4,
        total_votes=1,
        contract_address="0x" + "cd" * 20,
    )
    session.add(election)
    session.flush()
    session.add(
        Candidate(
            election_id=election.id,
            blockchain_election_id=1,
            blockchain_candidate_id=1,
            name="Alice",
            vote_count=1,
            active=True,
        )
    )
    session.add(
        Vote(
            election_id=election.id,
            blockchain_election_id=1,
            candidate_id=1,
            blockchain_candidate_id=1,
            voter_address="0x" + "11" * 20,
            block_number=20,
            transaction_hash="0x" + "0" * 64,
            log_index=0,
        )
    )
    session.commit()


def _chain(*, alice: int) -> dict:
    return {
        "source": "BLOCKCHAIN",
        "total_votes": alice,
        "candidates": [{"candidate_id": 1, "name": "Alice", "vote_count": alice}],
        "winner_id": 1,
        "tie": False,
    }


def test_results_endpoint_reports_match(
    api_client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _seed(db_session)
    monkeypatch.setattr(verification, "_blockchain_result", lambda _e: _chain(alice=1))
    resp = api_client.get("/api/v1/elections/1/results")
    assert resp.status_code == 200
    body = resp.json()
    assert body["indexed_result"]["source"] == "INDEXED"
    assert body["blockchain_result"]["source"] == "BLOCKCHAIN"
    assert body["verification"]["matches"] is True


def test_results_endpoint_reports_mismatch(
    api_client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _seed(db_session)
    monkeypatch.setattr(verification, "_blockchain_result", lambda _e: _chain(alice=5))
    resp = api_client.get("/api/v1/elections/1/results")
    assert resp.status_code == 200
    body = resp.json()
    assert body["verification"]["matches"] is False
    assert body["verification"]["differences"]


def test_results_endpoint_missing_election_404(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/elections/424242/results")
    assert resp.status_code == 404
