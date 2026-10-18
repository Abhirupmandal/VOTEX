"""Tests for dual-source results verification.

The authoritative on-chain read is monkeypatched so both the matching and the
divergent case can be asserted deterministically. The backend must never silently
reconcile a mismatch.
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.election import Election
from app.models.vote import Vote
from app.services.elections import verification


def _seed_election(session: Session) -> Election:
    election = Election(
        blockchain_election_id=1,
        title="E",
        state="ENDED",
        state_index=4,
        total_votes=3,
        contract_address="0x" + "cd" * 20,
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
                vote_count=3,
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
    for i in range(3):
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
    session.commit()
    return election


def _chain_result(*, alice: int, bob: int) -> dict:
    total = alice + bob
    return {
        "source": "BLOCKCHAIN",
        "total_votes": total,
        "candidates": [
            {"candidate_id": 1, "name": "Alice", "vote_count": alice},
            {"candidate_id": 2, "name": "Bob", "vote_count": bob},
        ],
        "winner_id": 1 if alice >= bob else 2,
        "tie": alice == bob,
    }


def test_verification_matches_when_sources_agree(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    election = _seed_election(db_session)
    monkeypatch.setattr(
        verification, "_blockchain_result", lambda _e: _chain_result(alice=3, bob=0)
    )
    outcome = verification.verify_election(db_session, election)

    assert outcome["verification"]["matches"] is True
    assert outcome["verification"]["differences"] == []
    assert outcome["indexed_result"]["total_votes"] == 3
    assert outcome["blockchain_result"]["total_votes"] == 3


def test_verification_detects_divergence(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    election = _seed_election(db_session)
    # On-chain shows a different tally than the index -> mismatch, NOT reconciled.
    monkeypatch.setattr(
        verification, "_blockchain_result", lambda _e: _chain_result(alice=2, bob=1)
    )
    outcome = verification.verify_election(db_session, election)

    assert outcome["verification"]["matches"] is False
    assert outcome["verification"]["differences"]
    # The indexed result is preserved verbatim (not overwritten by the chain read).
    assert outcome["indexed_result"]["candidates"][0]["vote_count"] == 3


def test_verification_handles_unavailable_chain(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    election = _seed_election(db_session)
    monkeypatch.setattr(verification, "_blockchain_result", lambda _e: None)
    outcome = verification.verify_election(db_session, election)

    assert outcome["blockchain_result"] is None
    assert outcome["verification"]["matches"] is False
    assert "blockchain_result_unavailable" in outcome["verification"]["differences"]


def test_indexed_result_flags_tie(db_session: Session) -> None:
    election = Election(
        blockchain_election_id=7, title="Tie", state="ENDED", state_index=4
    )
    db_session.add(election)
    db_session.flush()
    db_session.add_all(
        [
            Candidate(
                election_id=election.id,
                blockchain_election_id=7,
                blockchain_candidate_id=1,
                name="A",
                vote_count=1,
                active=True,
            ),
            Candidate(
                election_id=election.id,
                blockchain_election_id=7,
                blockchain_candidate_id=2,
                name="B",
                vote_count=1,
                active=True,
            ),
        ]
    )
    db_session.commit()

    indexed = verification._indexed_result(db_session, election)
    assert indexed["tie"] is True
    assert indexed["winner_id"] == 0
