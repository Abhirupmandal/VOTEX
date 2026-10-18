"""Tests for the synchronization engine.

A fake provider + fake listener are injected so the reorg / checkpoint logic can
be exercised deterministically. Reorg handling is validated with an injected
block-hash discontinuity (the local Hardhat network does not reorg naturally).
"""

from __future__ import annotations

import time
import pytest

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.blockchain_event import BlockchainEvent
from app.models.election import Election
from app.models.indexer_state import IndexerState
from app.services.blockchain import types as t
from app.services.blockchain.sync_manager import ContinuousIndexer, SyncManager

FACTORY = "0x" + "ab" * 20


class _FakeProvider:
    """Returns canned block hashes and a fixed head."""

    def __init__(
        self,
        *,
        latest: int = 100,
        hashes: dict[int, str | None] | None = None,
    ) -> None:
        self._latest = latest
        self._hashes = hashes or {}

    def get_latest_block(self) -> int:
        return self._latest

    def get_block(self, block_number: int):
        if block_number in self._hashes and self._hashes[block_number] is None:
            return None
        block_hash = self._hashes.get(block_number, "0x" + format(block_number, "064x"))
        return {"hash": block_hash, "timestamp": 1_700_000_000 + block_number}


class _FakeListener:
    """Returns pre-seeded decoded logs filtered by the requested block range."""

    def __init__(self, logs: list[t.DecodedLog]) -> None:
        self._logs = logs

    def fetch_decoded_logs(self, from_block: int, to_block: int) -> list[t.DecodedLog]:
        return [
            log
            for log in self._logs
            if from_block <= log.block_number <= to_block
        ]


def _settings(**overrides) -> Settings:
    base = dict(
        votex_factory_address=FACTORY,
        indexer_network="local",
        indexer_reorg_rewind=10,
        indexer_batch_size=2,
        indexer_start_block=0,
        indexer_confirmations=0,
    )
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _log(
    event_type: str,
    block_number: int,
    *,
    log_index: int,
    args: dict | None = None,
) -> t.DecodedLog:
    return t.DecodedLog(
        event_type=event_type,
        contract_address=FACTORY,
        transaction_hash="0x" + format(block_number, "064x"),
        block_number=block_number,
        block_hash="0x" + format(block_number, "064x"),
        transaction_index=0,
        log_index=log_index,
        timestamp=1_700_000_000,
        args=args or {},
    )


def test_sync_range_indexes_events(db_session: Session) -> None:
    logs = [
        _log(t.ELECTION_CREATED, 10, log_index=0, args={"electionId": 1, "title": "E"}),
        _log(
            t.CANDIDATE_ADDED,
            11,
            log_index=0,
            args={"electionId": 1, "candidateId": 1, "name": "Alice"},
        ),
    ]
    manager = SyncManager(
        settings=_settings(), provider=_FakeProvider(), listener=_FakeListener(logs)
    )
    result = manager.sync_range(db_session, 10, 11)

    assert result.from_block == 10
    assert result.to_block == 11
    assert result.blocks_processed == 2
    assert result.events_seen == 2
    assert result.events_indexed == 2
    assert result.events_skipped == 0
    assert int(db_session.scalar(select(func.count(Election.id))) or 0) == 1


def test_sync_range_is_idempotent(db_session: Session) -> None:
    logs = [
        _log(t.ELECTION_CREATED, 10, log_index=0, args={"electionId": 1, "title": "E"})
    ]
    manager = SyncManager(
        settings=_settings(), provider=_FakeProvider(), listener=_FakeListener(logs)
    )
    first = manager.sync_range(db_session, 10, 10)
    second = manager.sync_range(db_session, 10, 10)

    assert first.events_indexed == 1
    assert second.events_seen == 1
    assert second.events_indexed == 0
    assert second.events_skipped == 1
    # The election row is not duplicated by the replay.
    assert int(db_session.scalar(select(func.count(Election.id))) or 0) == 1


def test_get_or_create_state_is_idempotent(db_session: Session) -> None:
    manager = SyncManager(
        settings=_settings(), provider=_FakeProvider(), listener=_FakeListener([])
    )
    first = manager.get_or_create_state(db_session)
    second = manager.get_or_create_state(db_session)
    assert first.id == second.id
    assert int(db_session.scalar(select(func.count(IndexerState.id))) or 0) == 1


def test_reorg_detection_rewinds_and_clears_events(db_session: Session) -> None:
    settings = _settings(indexer_reorg_rewind=10)
    provider = _FakeProvider(hashes={20: "0x" + "ff" * 32})
    manager = SyncManager(
        settings=settings, provider=provider, listener=_FakeListener([])
    )

    state = manager.get_or_create_state(db_session)
    state.last_processed_block = 20
    state.last_processed_block_hash = "0x" + "00" * 32  # differs from chain
    state.status = "IDLE"
    db_session.commit()

    # Seed some raw events so we can observe the rewind pruning.
    for block in (5, 15, 18, 20):
        db_session.add(
            BlockchainEvent(
                event_type=t.ELECTION_CREATED,
                contract_address=FACTORY,
                transaction_hash="0x" + format(block, "064x"),
                block_number=block,
                log_index=0,
                payload={},
            )
        )
    db_session.commit()

    detected = manager._detect_and_handle_reorg(db_session, state)

    assert detected is True
    assert state.last_processed_block == 10  # 20 - rewind(10)
    assert state.last_processed_block_hash is None
    assert state.status == "REORG_DETECTED"
    remaining = db_session.scalars(select(BlockchainEvent.block_number)).all()
    assert all(block <= 10 for block in remaining)


def test_no_reorg_when_hash_matches(db_session: Session) -> None:
    settings = _settings()
    provider = _FakeProvider(hashes={20: "0x" + "00" * 32})
    manager = SyncManager(
        settings=settings, provider=provider, listener=_FakeListener([])
    )
    state = manager.get_or_create_state(db_session)
    state.last_processed_block = 20
    state.last_processed_block_hash = "0x" + "00" * 32
    db_session.commit()

    assert manager._detect_and_handle_reorg(db_session, state) is False
    assert state.last_processed_block == 20


def test_reorg_detected_when_checkpoint_block_missing(db_session: Session) -> None:
    settings = _settings()
    provider = _FakeProvider(hashes={20: None})
    manager = SyncManager(
        settings=settings, provider=provider, listener=_FakeListener([])
    )
    state = manager.get_or_create_state(db_session)
    state.last_processed_block = 20
    state.last_processed_block_hash = "0x" + "00" * 32
    db_session.commit()

    assert manager._detect_and_handle_reorg(db_session, state) is True
    assert state.status == "REORG_DETECTED"


def test_get_sync_status_reports_checkpoint(db_session: Session) -> None:
    # get_sync_status opens its own SessionLocal, so just assert the type/fields
    # via a manager bound to a live provider stub (skips if DB unavailable).
    manager = SyncManager(
        settings=_settings(), provider=_FakeProvider(latest=100), listener=_FakeListener([])
    )
    snapshot = manager.get_sync_status()
    assert snapshot.network == "local"
    assert snapshot.contract_address == FACTORY
    assert snapshot.latest_block == 100


class _FakeManager:
    """Counts sync_latest invocations for ContinuousIndexer tests."""

    def __init__(self) -> None:
        self.calls = 0

    def sync_latest(self) -> t.SyncResult:
        self.calls += 1
        return t.SyncResult(0, 0, 0, 0, 0, 0)


def test_continuous_indexer_starts_and_stops_cleanly() -> None:
    fake = _FakeManager()
    indexer = ContinuousIndexer(manager=fake, poll_interval=0.01)  # type: ignore[arg-type]
    indexer.start()
    time.sleep(0.05)
    indexer.stop(timeout=2.0)

    assert fake.calls >= 1
    assert indexer.running is False


def test_continuous_indexer_run_iterations_is_bounded() -> None:
    fake = _FakeManager()
    indexer = ContinuousIndexer(manager=fake, poll_interval=0.0)  # type: ignore[arg-type]
    indexer.run_iterations(3)
    assert fake.calls == 3
    assert indexer.running is False


def test_public_network_refuses_unsafe_zero_start_block(db_session: Session) -> None:
    # On public network (e.g. sepolia) with indexer_start_block = 0,
    # the indexer must refuse the unsafe 0 start block unless override is enabled.
    settings = _settings(
        indexer_network="sepolia",
        indexer_start_block=0,
        indexer_allow_unsafe_zero_start_block=False,
    )
    provider = _FakeProvider(latest=6_500_000)
    manager = SyncManager(
        settings=settings, provider=provider, listener=_FakeListener([])
    )

    with pytest.raises(ValueError, match="Unsafe indexer start block"):
        manager.get_or_create_state(db_session)


def test_public_network_safe_start_block_with_override(db_session: Session) -> None:
    # When override is enabled, it safely defaults to head block instead of 0.
    settings = _settings(
        indexer_network="sepolia",
        indexer_start_block=0,
        indexer_allow_unsafe_zero_start_block=True,
    )
    provider = _FakeProvider(latest=6_500_000)
    manager = SyncManager(
        settings=settings, provider=provider, listener=_FakeListener([])
    )

    state = manager.get_or_create_state(db_session)
    assert state.network == "sepolia"
    # last_processed_block should be latest - 1 (6_499_999), not 0!
    assert state.last_processed_block == 6_499_999


def test_public_network_respects_explicit_start_block(db_session: Session) -> None:
    # When indexer_start_block is explicitly configured, it is respected.
    settings = _settings(indexer_network="sepolia-explicit", indexer_start_block=6_000_000)
    provider = _FakeProvider(latest=6_500_000)
    manager = SyncManager(
        settings=settings, provider=provider, listener=_FakeListener([])
    )

    state = manager.get_or_create_state(db_session)
    assert state.network == "sepolia-explicit"
    assert state.last_processed_block == 5_999_999


