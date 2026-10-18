"""Shared FastAPI dependencies (pagination, sessions, limit clamping)."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Query

from app.core.config import get_settings


@dataclass
class Pagination:
    """Validated pagination parameters."""

    page: int
    page_size: int


def pagination(
    page: int = Query(1, ge=1, description="1-based page number."),
    page_size: int | None = Query(
        None,
        ge=1,
        description="Rows per page (clamped to the server maximum).",
    ),
) -> Pagination:
    """Return validated pagination parameters, clamping page_size safely."""
    settings = get_settings()
    size = page_size or settings.default_page_size
    size = max(1, min(size, settings.max_page_size))
    return Pagination(page=page, page_size=size)
