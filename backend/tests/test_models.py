"""Tests for ORM model metadata (constraints and indexes).

These assertions pin the schema contract without needing a live database.
"""

from __future__ import annotations

from sqlalchemy import UniqueConstraint

from app.models import (
    Base,
    BlockchainEvent,
    Candidate,
    Election,
    IndexerState,
    Vote,
    Voter,
)


def _unique_constraints(table) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for constraint in table.constraints:
        if isinstance(constraint, UniqueConstraint):
            result[constraint.name] = {c.name for c in constraint.columns}
    return result


def _index_names(table) -> dict[str, bool]:
    return {idx.name: bool(idx.unique) for idx in table.indexes}


def test_all_tables_registered() -> None:
    assert {
        "elections",
        "candidates",
        "voters",
        "votes",
        "blockchain_events",
        "indexer_state",
    } <= set(Base.metadata.tables)


def test_elections_chain_id_is_unique_index() -> None:
    indexes = _index_names(Election.__table__)
    assert indexes.get("ix_elections_blockchain_election_id") is True
    assert "uq_elections_blockchain_election_id" not in _unique_constraints(
        Election.__table__
    )


def test_voters_wallet_is_unique_index() -> None:
    indexes = _index_names(Voter.__table__)
    assert indexes.get("ix_voters_wallet_address") is True
    assert "uq_voters_wallet_address" not in _unique_constraints(Voter.__table__)


def test_votes_idempotency_constraint() -> None:
    constraints = _unique_constraints(Vote.__table__)
    assert constraints["uq_votes_tx_log"] == {"transaction_hash", "log_index"}


def test_events_idempotency_constraint() -> None:
    constraints = _unique_constraints(BlockchainEvent.__table__)
    assert constraints["uq_events_tx_log"] == {"transaction_hash", "log_index"}


def test_candidates_unique_per_election() -> None:
    constraints = _unique_constraints(Candidate.__table__)
    assert constraints["uq_candidates_election_chain_id"] == {
        "election_id",
        "blockchain_candidate_id",
    }


def test_indexer_state_key_is_unique() -> None:
    constraints = _unique_constraints(IndexerState.__table__)
    assert constraints["uq_indexer_state_key"] == {"indexer_key"}


def test_performance_indexes_present() -> None:
    events = _index_names(BlockchainEvent.__table__)
    assert events.get("ix_blockchain_events_transaction_hash") is False
    assert events.get("ix_blockchain_events_block_number") is False
    assert events.get("ix_events_block_log") is False
    assert events.get("ix_events_contract_block") is False

    votes = _index_names(Vote.__table__)
    assert votes.get("ix_votes_transaction_hash") is False
    assert votes.get("ix_votes_block_number") is False
    assert votes.get("ix_votes_voter_address") is False
    assert votes.get("ix_votes_election_block") is False
