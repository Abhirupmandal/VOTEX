"""Tests for the REST API read endpoints.

A live PostgreSQL instance is required; the ``db_session`` fixture skips the
suite cleanly when the database is unreachable. ``get_db`` is overridden to
share the rolled-back test session so no residue is left behind.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.main import app
from app.models.blockchain_event import BlockchainEvent
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.vote import Vote
from app.models.voter import Voter

FACTORY = "0x" + "ab" * 20
ELECTION_ADDR = "0x" + "cd" * 20
VOTER = "0x" + "11" * 20


@pytest.fixture()
def api_client(client: TestClient, db_session: Session):
    """A TestClient whose ``get_db`` yields the rolled-back test session."""

    def _override():
        yield db_session  # deliberately not closed here

    app.dependency_overrides[get_db] = _override
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


def _seed(session: Session) -> Election:
    election = Election(
        blockchain_election_id=1,
        title="General Election 2026",
        description="Demo",
        state="ACTIVE",
        state_index=2,
        total_votes=2,
        contract_address=ELECTION_ADDR,
        creator="0x" + "aa" * 20,
        created_block=10,
        created_tx_hash="0x" + "01" * 32,
    )
    session.add(election)
    session.flush()

    session.add_all(
        [
            Candidate(
                election_id=election.id,
                blockchain_election_id=1,
                blockchain_candidate_id=1,
                name="Alice",
                vote_count=2,
                active=True,
            ),
            Candidate(
                election_id=election.id,
                blockchain_election_id=1,
                blockchain_candidate_id=2,
                name="Bob",
                vote_count=0,
                active=True,
            ),
        ]
    )
    for i in range(2):
        session.add(
            Vote(
                election_id=election.id,
                blockchain_election_id=1,
                candidate_id=1,
                blockchain_candidate_id=1,
                voter_address="0x" + f"{i:02x}" * 20,
                block_number=20 + i,
                transaction_hash="0x" + f"{i:064x}",
                log_index=i,
            )
        )
    session.add(
        Voter(
            wallet_address=VOTER,
            credential_commitment="0x" + "01" * 32,
            active=True,
            registered_block=5,
        )
    )
    session.add(
        BlockchainEvent(
            event_type="VoteCast",
            contract_address=ELECTION_ADDR,
            transaction_hash="0x" + "e" * 64,
            block_number=20,
            log_index=0,
            payload={"electionId": 1, "candidateId": 1},
        )
    )
    session.commit()
    return election


def test_health_endpoint(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_list_elections_is_labelled_indexed(
    api_client: TestClient, db_session: Session
) -> None:
    _seed(db_session)
    resp = api_client.get("/api/v1/elections")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "OFF-CHAIN INDEXED VIEW"
    assert body["total"] >= 1


def test_get_election_detail(api_client: TestClient, db_session: Session) -> None:
    _seed(db_session)
    resp = api_client.get("/api/v1/elections/1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["blockchain_election_id"] == 1
    assert body["source"] == "OFF-CHAIN INDEXED VIEW"


def test_get_election_missing_returns_404(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/elections/9999")
    assert resp.status_code == 404


def test_list_candidates(api_client: TestClient, db_session: Session) -> None:
    _seed(db_session)
    resp = api_client.get("/api/v1/elections/1/candidates")
    assert resp.status_code == 200
    names = {c["name"] for c in resp.json()}
    assert {"Alice", "Bob"} <= names


def test_get_single_candidate(api_client: TestClient, db_session: Session) -> None:
    _seed(db_session)
    resp = api_client.get("/api/v1/elections/1/candidates/1")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Alice"


def test_get_missing_candidate_returns_404(
    api_client: TestClient, db_session: Session
) -> None:
    _seed(db_session)
    resp = api_client.get("/api/v1/elections/1/candidates/99")
    assert resp.status_code == 404


def test_list_votes_paginated(api_client: TestClient, db_session: Session) -> None:
    _seed(db_session)
    resp = api_client.get("/api/v1/elections/1/votes")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert body["source"] == "OFF-CHAIN INDEXED VIEW"


def test_votes_for_missing_election_returns_404(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/elections/9999/votes")
    assert resp.status_code == 404


def test_get_voter_by_wallet(api_client: TestClient, db_session: Session) -> None:
    _seed(db_session)
    resp = api_client.get(f"/api/v1/voters/{VOTER}")
    assert resp.status_code == 200
    assert resp.json()["wallet_address"] == VOTER


def test_voter_unknown_wallet_returns_404(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/voters/0x" + "99" * 20)
    assert resp.status_code == 404


def test_voter_invalid_address_returns_400(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/voters/not-an-address")
    assert resp.status_code == 400


def test_analytics_is_labelled_indexed(
    api_client: TestClient, db_session: Session
) -> None:
    _seed(db_session)
    resp = api_client.get("/api/v1/elections/1/analytics")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "OFF-CHAIN INDEXED VIEW"
    assert body["total_votes"] == 2


def test_audit_events_listing(api_client: TestClient, db_session: Session) -> None:
    _seed(db_session)
    resp = api_client.get("/api/v1/audit/events?event_type=VoteCast")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "OFF-CHAIN INDEXED VIEW"
    assert body["total"] >= 1


def test_audit_transaction_lookup(api_client: TestClient, db_session: Session) -> None:
    _seed(db_session)
    resp = api_client.get("/api/v1/audit/transactions/0x" + "e" * 64)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_audit_transaction_invalid_hash_returns_400(
    api_client: TestClient,
) -> None:
    resp = api_client.get("/api/v1/audit/transactions/0x123")
    assert resp.status_code == 400


def test_audit_transaction_unknown_returns_404(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/audit/transactions/0x" + "f" * 64)
    assert resp.status_code == 404


def test_pagination_clamps_to_server_max(
    api_client: TestClient, db_session: Session
) -> None:
    _seed(db_session)
    resp = api_client.get("/api/v1/elections?page=1&page_size=100000")
    assert resp.status_code == 200
    assert resp.json()["page_size"] == 100  # max_page_size


def test_pagination_rejects_zero_page(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/elections?page=0")
    assert resp.status_code == 422


def test_blockchain_status_shape(api_client: TestClient) -> None:
    resp = api_client.get("/api/v1/blockchain/status")
    assert resp.status_code == 200
    body = resp.json()
    for key in ("connected", "chain_id", "expected_chain_id", "latest_block", "rpc"):
        assert key in body
    # The RPC URL must never be leaked in the response.
    assert "blockchain_rpc_url" not in body
