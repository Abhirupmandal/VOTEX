"""Pydantic schemas for election API responses."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ElectionBase(BaseModel):
    """Shared election fields."""

    model_config = ConfigDict(from_attributes=True)

    blockchain_election_id: int
    title: str
    description: str = ""
    registration_start: int | None = None
    registration_end: int | None = None
    voting_start: int | None = None
    voting_end: int | None = None
    state: str
    state_index: int
    total_votes: int
    total_registered_voters: int
    created_block: int | None = None
    created_tx_hash: str | None = None


class ElectionSummary(ElectionBase):
    """Election as returned in list endpoints."""

    id: int


class ElectionDetail(ElectionBase):
    """Election as returned by the detail endpoint."""

    id: int
    contract_address: str | None = None
    creator: str | None = None
    created_at: datetime
    updated_at: datetime


class PaginatedElections(BaseModel):
    """Paginated election collection."""

    items: list[ElectionSummary]
    page: int
    page_size: int
    total: int
    pages: int
    source: str = Field(
        default="OFF-CHAIN INDEXED VIEW",
        description="Analytics/read-model provenance label.",
    )
