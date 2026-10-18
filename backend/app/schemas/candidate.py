"""Pydantic schemas for candidate API responses."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class CandidateOut(BaseModel):
    """A candidate in the indexed read model."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    blockchain_candidate_id: int
    blockchain_election_id: int
    name: str
    description: str = ""
    vote_count: int
    active: bool
    created_block: int | None = None
    created_tx_hash: str | None = None
