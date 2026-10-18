"""Pydantic schemas for voter API responses (public fields only)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class VoterOut(BaseModel):
    """A registered voter as exposed by the API.

    Deliberately excludes any personally identifiable information; only the
    public wallet address and opaque commitment (both already public on-chain)
    are returned.
    """

    model_config = ConfigDict(from_attributes=True)

    wallet_address: str
    credential_commitment: str | None = None
    active: bool
    registered_at: int | None = None
    registered_block: int | None = None
    registered_tx_hash: str | None = None


class PaginatedVoters(BaseModel):
    """Paginated list of registered voters."""

    items: list[VoterOut]
    page: int
    page_size: int
    total: int
    pages: int
    source: str = "indexed"

