"""Shared pytest fixtures for the VOTEX backend Phase 3 test suite.

DB-backed fixtures connect to the real PostgreSQL instance and wrap each test in
a transaction that is rolled back afterwards, so the suite never leaves residue.
Tests that need a database skip cleanly when PostgreSQL is unreachable.
"""

from __future__ import annotations

import uuid
from typing import Any, Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sqlalchemy import text

import app.models  # noqa: F401  (ensures every table is registered on Base)
from app.core.database import Base, check_database_connection, engine
from app.main import app
from app.services.blockchain import types as t


@pytest.fixture(scope="function", autouse=True)
def _clean_database() -> None:
    """Start every session from an empty read model.

    The suite shares the configured PostgreSQL instance. Demo/seed scripts and
    the real-chain integration test commit rows outside the per-test rollback
    transaction, so count-sensitive and uniqueness tests would otherwise depend
    on whatever data happens to be present. Truncating once up front makes the
    suite deterministic and independent of prior runs.
    """
    if not check_database_connection():
        return
    if not Base.metadata.sorted_tables:
        return
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    with engine.begin() as connection:
        if engine.dialect.name == "sqlite":
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(text(f'DELETE FROM "{table.name}"'))
        else:
            connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture()
def client() -> TestClient:
    """A FastAPI test client (no lifespan startup, so no indexer thread)."""
    return TestClient(app)


@pytest.fixture()
def db_session() -> Session:
    """A session bound to an outer transaction that always rolls back."""
    if not check_database_connection():
        pytest.skip("PostgreSQL is not reachable; skipping DB-backed test.")

    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def make_log() -> Callable[..., t.DecodedLog]:
    """Factory that builds :class:`DecodedLog` objects with sane defaults."""
    counter = {"n": 0}

    def _make(
        event_type: str,
        args: dict[str, Any],
        *,
        block_number: int = 100,
        log_index: int | None = None,
        tx_hash: str | None = None,
        contract_address: str = "0x" + "ab" * 20,
        timestamp: int = 1_700_000_000,
    ) -> t.DecodedLog:
        counter["n"] += 1
        index = log_index if log_index is not None else counter["n"]
        txh = tx_hash or ("0x" + uuid.uuid4().hex + uuid.uuid4().hex)
        return t.DecodedLog(
            event_type=event_type,
            contract_address=contract_address,
            transaction_hash=txh,
            block_number=block_number,
            block_hash="0x" + "cd" * 32,
            transaction_index=0,
            log_index=index,
            timestamp=timestamp,
            args=args,
        )

    return _make
