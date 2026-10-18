"""Pydantic schemas for vote API responses."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class VoteOut(BaseModel):
    """A single indexed vote event."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    blockchain_election_id: int
    blockchain_candidate_id: int
    voter_address: str
    block_number: int
    transaction_hash: str
    transaction_index: int
    log_index: int
    timestamp: int | None = None
    gas_used: int | None = None


class PaginatedVotes(BaseModel):
    """Paginated vote collection."""

    items: list[VoteOut]
    page: int
    page_size: int
    total: int
    pages: int
    source: str = "OFF-CHAIN INDEXED VIEW"
