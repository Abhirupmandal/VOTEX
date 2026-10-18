"""Tests for the Event Processor: projection + idempotency.

Requires a live PostgreSQL instance; those tests skip cleanly otherwise via the
``db_session`` fixture.
"""

from __future__ import annotations

from typing import Any, Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.blockchain_event import BlockchainEvent
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.vote import Vote
from app.models.voter import Voter
from app.services.blockchain import types as t
from app.services.blockchain.event_processor import EventProcessor

MakeLog = Callable[..., t.DecodedLog]

ELECTION_ID = 1
CANDIDATE_ID = 1
VOTER = "0x" + "11" * 20


def _count(session: Session, model: Any) -> int:
    return int(session.scalar(select(func.count(model.id))) or 0)


def test_election_created_projects_election(
    db_session: Session, make_log: MakeLog
) -> None:
    processor = EventProcessor(db_session)
    log = make_log(
        t.ELECTION_CREATED,
        {
            "electionId": ELECTION_ID,
            "creator": "0x" + "AA" * 20,
            "title": "General Election 2026",
            "_contract_address": "0x" + "BB" * 20,
        },
    )
    assert processor.process(log) is True

    election = db_session.scalar(
        select(Election).where(Election.blockchain_election_id == ELECTION_ID)
    )
    assert election is not None
    assert election.title == "General Election 2026"
    assert election.creator == "0x" + "aa" * 20  # normalised to lowercase
    assert election.contract_address == "0x" + "bb" * 20
    assert election.created_block == log.block_number


def test_candidate_added_creates_candidate(
    db_session: Session, make_log: MakeLog
) -> None:
    processor = EventProcessor(db_session)
    processor.process(
        make_log(t.ELECTION_CREATED, {"electionId": ELECTION_ID, "title": "E"})
    )
    assert processor.process(
        make_log(
            t.CANDIDATE_ADDED,
            {"electionId": ELECTION_ID, "candidateId": CANDIDATE_ID, "name": "Alice"},
        )
    )

    candidate = db_session.scalar(select(Candidate))
    assert candidate is not None
    assert candidate.name == "Alice"
    assert candidate.vote_count == 0
    assert candidate.active is True


def test_candidate_deactivated_marks_inactive(
    db_session: Session, make_log: MakeLog
) -> None:
    processor = EventProcessor(db_session)
    processor.process(
        make_log(t.ELECTION_CREATED, {"electionId": ELECTION_ID, "title": "E"})
    )
    processor.process(
        make_log(
            t.CANDIDATE_ADDED,
            {"electionId": ELECTION_ID, "candidateId": CANDIDATE_ID, "name": "Alice"},
        )
    )
    processor.process(
        make_log(
            t.CANDIDATE_DEACTIVATED,
            {"electionId": ELECTION_ID, "candidateId": CANDIDATE_ID},
        )
    )
    candidate = db_session.scalar(select(Candidate))
    assert candidate.active is False


def test_vote_cast_increments_tallies_exactly_once(
    db_session: Session, make_log: MakeLog
) -> None:
    processor = EventProcessor(db_session)
    processor.process(
        make_log(t.ELECTION_CREATED, {"electionId": ELECTION_ID, "title": "E"})
    )
    processor.process(
        make_log(
            t.CANDIDATE_ADDED,
            {"electionId": ELECTION_ID, "candidateId": CANDIDATE_ID, "name": "Alice"},
        )
    )

    vote_log = make_log(
        t.VOTE_CAST,
        {"electionId": ELECTION_ID, "candidateId": CANDIDATE_ID, "voter": VOTER},
    )
    assert processor.process(vote_log) is True

    candidate = db_session.scalar(select(Candidate))
    election = db_session.scalar(select(Election))
    assert candidate.vote_count == 1
    assert election.total_votes == 1
    assert _count(db_session, Vote) == 1


def test_duplicate_vote_is_not_double_counted(
    db_session: Session, make_log: MakeLog
) -> None:
    """The core idempotency guarantee: replaying a log must not double-count."""
    processor = EventProcessor(db_session)
    processor.process(
        make_log(t.ELECTION_CREATED, {"electionId": ELECTION_ID, "title": "E"})
    )
    processor.process(
        make_log(
            t.CANDIDATE_ADDED,
            {"electionId": ELECTION_ID, "candidateId": CANDIDATE_ID, "name": "Alice"},
        )
    )

    vote_log = make_log(
        t.VOTE_CAST,
        {"electionId": ELECTION_ID, "candidateId": CANDIDATE_ID, "voter": VOTER},
    )
    first = processor.process(vote_log)
    second = processor.process(vote_log)  # identical tx hash + log index

    assert first is True
    assert second is False  # recognised as a duplicate

    candidate = db_session.scalar(select(Candidate))
    election = db_session.scalar(select(Election))
    assert candidate.vote_count == 1
    assert election.total_votes == 1
    assert _count(db_session, Vote) == 1
    # Exactly one raw event row was persisted (the duplicate was skipped).
    vote_events = db_session.scalar(
        select(func.count(BlockchainEvent.id)).where(
            BlockchainEvent.event_type == t.VOTE_CAST
        )
    )
    assert vote_events == 1


def test_two_distinct_votes_are_counted_separately(
    db_session: Session, make_log: MakeLog
) -> None:
    processor = EventProcessor(db_session)
    processor.process(
        make_log(t.ELECTION_CREATED, {"electionId": ELECTION_ID, "title": "E"})
    )
    processor.process(
        make_log(
            t.CANDIDATE_ADDED,
            {"electionId": ELECTION_ID, "candidateId": CANDIDATE_ID, "name": "Alice"},
        )
    )
    processor.process(
        make_log(
            t.VOTE_CAST,
            {"electionId": ELECTION_ID, "candidateId": CANDIDATE_ID, "voter": VOTER},
        )
    )
    # A different transaction hash -> a genuinely new vote.
    processor.process(
        make_log(
            t.VOTE_CAST,
            {
                "electionId": ELECTION_ID,
                "candidateId": CANDIDATE_ID,
                "voter": "0x" + "22" * 20,
            },
            tx_hash="0x" + "ee" * 32,
            log_index=99,
        )
    )
    election = db_session.scalar(select(Election))
    assert election.total_votes == 2
    assert _count(db_session, Vote) == 2


def test_election_state_changed_maps_index_to_name(
    db_session: Session, make_log: MakeLog
) -> None:
    processor = EventProcessor(db_session)
    processor.process(
        make_log(t.ELECTION_CREATED, {"electionId": ELECTION_ID, "title": "E"})
    )
    processor.process(
        make_log(
            t.ELECTION_STATE_CHANGED,
            {"electionId": ELECTION_ID, "previousState": 0, "newState": 2},
        )
    )
    election = db_session.scalar(select(Election))
    assert election.state == "ACTIVE"
    assert election.state_index == 2


def test_voter_registered_creates_active_voter(
    db_session: Session, make_log: MakeLog
) -> None:
    processor = EventProcessor(db_session)
    processor.process(
        make_log(
            t.VOTER_REGISTERED,
            {
                "voter": VOTER,
                "credentialCommitment": b"\x01" * 32,
                "timestamp": 1_700_000_000,
            },
        )
    )
    voter = db_session.scalar(select(Voter))
    assert voter is not None
    assert voter.wallet_address == VOTER
    assert voter.active is True
    assert voter.credential_commitment == "0x" + "01" * 32


def test_voter_deactivate_then_reactivate(
    db_session: Session, make_log: MakeLog
) -> None:
    processor = EventProcessor(db_session)
    processor.process(make_log(t.VOTER_REGISTERED, {"voter": VOTER}))
    processor.process(make_log(t.VOTER_DEACTIVATED, {"voter": VOTER}))
    assert db_session.scalar(select(Voter)).active is False
    processor.process(make_log(t.VOTER_REACTIVATED, {"voter": VOTER}))
    assert db_session.scalar(select(Voter)).active is True


def test_unsupported_event_is_skipped(
    db_session: Session, make_log: MakeLog
) -> None:
    processor = EventProcessor(db_session)
    assert processor.process(make_log("SomethingElse", {})) is False
    assert _count(db_session, BlockchainEvent) == 0


def test_emergency_controller_updated_is_audited_only(
    db_session: Session, make_log: MakeLog
) -> None:
    processor = EventProcessor(db_session)
    assert processor.process(
        make_log(t.EMERGENCY_CONTROLLER_UPDATED, {"controller": "0x" + "33" * 20})
    )
    # No read-model mutation, but the raw event is retained for auditing.
    assert _count(db_session, BlockchainEvent) == 1
    assert _count(db_session, Election) == 0
