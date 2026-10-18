"""Pydantic schemas for audit, verification, analytics, and chain status."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditEventOut(BaseModel):
    """A decoded blockchain event for the audit explorer."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: str
    contract_address: str
    transaction_hash: str
    block_number: int
    block_hash: str | None = None
    transaction_index: int
    log_index: int
    timestamp: int | None = None
    payload: dict[str, Any]
    created_at: datetime


class PaginatedAuditEvents(BaseModel):
    """Paginated audit event collection."""

    items: list[AuditEventOut]
    page: int
    page_size: int
    total: int
    pages: int
    source: str = "OFF-CHAIN INDEXED VIEW"


class CandidateResult(BaseModel):
    """Per-candidate tally within a result set."""

    candidate_id: int
    name: str | None = None
    vote_count: int
    active: bool | None = None


class ResultSet(BaseModel):
    """A tally snapshot from a single source (indexed or blockchain)."""

    source: str
    total_votes: int
    candidates: list[CandidateResult]
    winner_id: int | None = None
    tie: bool | None = None


class ResultVerification(BaseModel):
    """Comparison of the indexed read model against the blockchain."""

    matches: bool
    differences: list[str] = []


class ElectionResultsOut(BaseModel):
    """Dual-source election results with explicit verification."""

    election_id: int
    indexed_result: ResultSet
    blockchain_result: ResultSet | None = None
    verification: ResultVerification


class AnalyticsOut(BaseModel):
    """Indexed analytical view of an election."""

    election_id: int
    source: str = "OFF-CHAIN INDEXED VIEW"
    total_votes: int
    registered_voters: int
    turnout: float
    votes_by_candidate: list[CandidateResult]
    activity_over_time: list[dict[str, Any]]
    state: str


class BlockchainStatusOut(BaseModel):
    """Connectivity status of the configured RPC endpoint."""

    connected: bool
    chain_id: int | None = None
    expected_chain_id: int
    latest_block: int | None = None
    rpc: str
    factory_address: str | None = None
    error: str | None = None


class SyncStatusOut(BaseModel):
    """Indexer synchronization status."""

    network: str
    contract_address: str
    status: str
    last_processed_block: int
    last_processed_block_hash: str | None = None
    latest_block: int | None = None
    behind_by: int | None = None
    events_indexed: int
    updated_at: datetime | None = None
