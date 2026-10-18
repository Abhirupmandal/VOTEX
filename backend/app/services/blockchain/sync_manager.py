"""Synchronization engine.

Coordinates the listener + processor to advance the indexed read model, with:

* **Initial sync** — backfill from a configured start block to the current head.
* **Continuous sync** — a poll loop that can be stopped cleanly (never an
  uncontrolled infinite loop that blocks shutdown).
* **Resumable checkpoints** — the last processed block + hash are persisted so
  indexing continues after a restart.
* **Reorg awareness** — a stored block-hash discontinuity triggers a rewind and
  re-processing of the affected range.

Limitation (documented in docs/architecture/backend.md): the local Hardhat
network does not exhibit realistic mainnet reorgs, so reorg handling is
expressed structurally and unit-tested with an injected discontinuity rather
than by forcing a real chain reorganization.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.models.blockchain_event import BlockchainEvent
from app.models.indexer_state import IndexerState
from app.services.blockchain.event_listener import EventListener
from app.services.blockchain.event_processor import EventProcessor
from app.services.blockchain.provider import Web3Provider, get_provider
from app.services.blockchain.types import SyncResult

logger = get_logger("votex.indexer.sync")


class SyncError(RuntimeError):
    """Raised when synchronization cannot proceed (e.g. no factory address)."""


@dataclass
class SyncStatus:
    """Human-readable synchronization status snapshot."""

    network: str
    contract_address: str
    status: str
    last_processed_block: int
    last_processed_block_hash: str | None
    latest_block: int | None
    behind_by: int | None
    events_indexed: int
    updated_at: object | None


class SyncManager:
    """Advances the indexed read model from chain events."""

    def __init__(
        self,
        settings: Settings | None = None,
        provider: Web3Provider | None = None,
        listener: EventListener | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.provider = provider or get_provider()
        self.listener = listener or EventListener(provider=self.provider)

    # -- State helpers ----------------------------------------------------

    def _state_key(self) -> str:
        return f"{self.settings.indexer_network}:{self.settings.votex_factory_address.lower()}"

    def _contract_address(self) -> str:
        return self.settings.votex_factory_address.lower()

    def get_or_create_state(self, session: Session) -> IndexerState:
        key = self._state_key()
        state = session.scalar(
            select(IndexerState).where(IndexerState.indexer_key == key)
        )
        if state is None:
            # Safe start block protection for public testnets:
            # Scanning from block 0 on a public network like Ethereum Sepolia (block ~6.5M+)
            # would issue hundreds of thousands of RPC getLogs calls, quickly exhausting
            # rate limits, risking provider bans, and causing the indexer to stall.
            # Therefore, public testnets strictly require an explicit INDEXER_START_BLOCK
            # corresponding to the contract deployment block, unless explicitly overridden.
            start_block = self.settings.indexer_start_block
            is_public_network = self.settings.indexer_network.lower() not in {"local", "hardhat", "localhost"}

            if is_public_network and start_block <= 0:
                if not self.settings.indexer_allow_unsafe_zero_start_block:
                    raise ValueError(
                        f"Unsafe indexer start block ({start_block}) refused for network '{self.settings.indexer_network}'. "
                        "Public testnets require an explicit INDEXER_START_BLOCK (matching your factory deployment "
                        "block from deployments/sepolia.json) to prevent scanning millions of historical blocks. "
                        "To override this protection, set INDEXER_ALLOW_UNSAFE_ZERO_START_BLOCK=true."
                    )
                try:
                    start_block = self.provider.get_latest_block()
                    logger.warning(
                        "public_network_indexer_start_block_unspecified_fallback_head",
                        extra={
                            "event": "indexer_start_block_fallback",
                            "network": self.settings.indexer_network,
                            "fallback_block": start_block,
                        },
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.error(
                        "failed_to_fetch_latest_block_for_indexer_start",
                        extra={"error": str(exc)},
                    )
                    start_block = 0

            state = IndexerState(
                network=self.settings.indexer_network,
                contract_address=self._contract_address(),
                indexer_key=key,
                last_processed_block=max(0, start_block - 1),
                events_indexed=0,
                status="IDLE",
            )
            session.add(state)
            session.commit()
            session.refresh(state)
        return state

    # -- Reorg detection --------------------------------------------------

    def _detect_and_handle_reorg(self, session: Session, state: IndexerState) -> bool:
        """Return True if a reorg was detected and the state rewound."""
        if not state.last_processed_block_hash or state.last_processed_block <= 0:
            return False

        block = self.provider.get_block(state.last_processed_block)
        if block is None:
            # The checkpointed block no longer exists — definitely a reorg.
            rewound = self._rewind(session, state)
            logger.warning(
                "reorg_checkpoint_missing",
                extra={
                    "event": "reorg_detected",
                    "block_number": state.last_processed_block,
                    "rewound_to": rewound,
                },
            )
            return True

        on_chain_hash = block["hash"].hex() if isinstance(block["hash"], bytes) else block["hash"]
        if on_chain_hash.lower() != state.last_processed_block_hash.lower():
            rewound = self._rewind(session, state)
            logger.warning(
                "reorg_hash_mismatch",
                extra={
                    "event": "reorg_detected",
                    "block_number": state.last_processed_block,
                    "rewound_to": rewound,
                },
            )
            return True
        return False

    def _rewind(self, session: Session, state: IndexerState) -> int:
        """Rewind the checkpoint and discard events from the reorged range."""
        target = max(0, state.last_processed_block - self.settings.indexer_reorg_rewind)

        # Drop affected events and read-model rows so they can be re-indexed.
        session.execute(
            delete(BlockchainEvent).where(BlockchainEvent.block_number > target)
        )
        self._reset_read_model(session)

        state.last_processed_block = target
        state.last_processed_block_hash = None
        state.status = "REORG_DETECTED"
        session.commit()
        session.refresh(state)
        return target

    def _reset_read_model(self, session: Session) -> None:
        """Clear projected read-model data (events are the source of replay)."""
        from app.models.candidate import Candidate
        from app.models.election import Election
        from app.models.vote import Vote
        from app.models.voter import Voter

        session.execute(delete(Vote))
        session.execute(delete(Candidate))
        session.execute(delete(Election))
        session.execute(delete(Voter))
        session.commit()

    # -- Core range sync --------------------------------------------------

    def sync_range(
        self, session: Session, from_block: int, to_block: int
    ) -> SyncResult:
        """Index events in ``[from_block, to_block]`` (inclusive)."""
        processor = EventProcessor(session)
        events_seen = 0
        events_indexed = 0
        events_skipped = 0
        blocks_processed = 0
        cursor = from_block

        batch_size = max(1, self.settings.indexer_batch_size)

        while cursor <= to_block:
            batch_end = min(cursor + batch_size - 1, to_block)
            logs = self.listener.fetch_decoded_logs(cursor, batch_end)
            for log in logs:
                events_seen += 1
                if processor.process(log):
                    events_indexed += 1
                else:
                    events_skipped += 1
            session.commit()
            blocks_processed += batch_end - cursor + 1
            cursor = batch_end + 1

        return SyncResult(
            from_block=from_block,
            to_block=to_block,
            blocks_processed=blocks_processed,
            events_seen=events_seen,
            events_indexed=events_indexed,
            events_skipped=events_skipped,
        )

    def _update_checkpoint(
        self, session: Session, state: IndexerState, to_block: int, indexed_delta: int
    ) -> None:
        block = self.provider.get_block(to_block)
        state.last_processed_block = to_block
        if block is not None:
            bh = block["hash"]
            state.last_processed_block_hash = (
                bh.hex() if isinstance(bh, bytes) else bh
            )
        state.events_indexed = (state.events_indexed or 0) + indexed_delta
        state.status = "IDLE"
        session.commit()
        session.refresh(state)

    # -- Public API -------------------------------------------------------

    def sync_from_block(self, from_block: int) -> SyncResult:
        """Backfill from an explicit block up to the safe head."""
        if not self.settings.is_indexer_configured:
            raise SyncError(
                "VOTEX_FACTORY_ADDRESS is not configured; cannot index."
            )

        session = SessionLocal()
        try:
            state = self.get_or_create_state(session)
            state.status = "SYNCING"
            session.commit()

            latest = self.provider.get_latest_block()
            safe_head = max(0, latest - self.settings.indexer_confirmations)
            if safe_head < from_block:
                state.status = "IDLE"
                session.commit()
                return SyncResult(from_block, from_block - 1, 0, 0, 0, 0)

            result = self.sync_range(session, from_block, safe_head)
            self._update_checkpoint(session, state, safe_head, result.events_indexed)
            return result
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def sync_latest(self) -> SyncResult:
        """Resume from the checkpoint and sync to the safe head.

        Performs reorg detection before advancing and is safe to call repeatedly
        (idempotent thanks to the event-identity constraint).
        """
        if not self.settings.is_indexer_configured:
            raise SyncError(
                "VOTEX_FACTORY_ADDRESS is not configured; cannot index."
            )

        session = SessionLocal()
        try:
            state = self.get_or_create_state(session)
            reorg_detected = self._detect_and_handle_reorg(session, state)

            latest = self.provider.get_latest_block()
            safe_head = max(0, latest - self.settings.indexer_confirmations)

            start = state.last_processed_block + 1
            if start > safe_head:
                log_msg = "indexer_up_to_date"
                logger.info(
                    log_msg,
                    extra={
                        "event": log_msg,
                        "block_number": state.last_processed_block,
                    },
                )
                return SyncResult(
                    from_block=start,
                    to_block=safe_head,
                    blocks_processed=0,
                    events_seen=0,
                    events_indexed=0,
                    events_skipped=0,
                    reorg_detected=reorg_detected,
                )

            state.status = "SYNCING"
            session.commit()

            result = self.sync_range(session, start, safe_head)
            self._update_checkpoint(session, state, safe_head, result.events_indexed)
            result.reorg_detected = reorg_detected
            return result
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def get_sync_status(self) -> SyncStatus:
        """Return the current synchronization status."""
        session = SessionLocal()
        try:
            state = self.get_or_create_state(session)
            latest: int | None
            try:
                latest = self.provider.get_latest_block()
            except Exception:  # noqa: BLE001
                latest = None
            behind = (
                max(0, latest - state.last_processed_block)
                if latest is not None
                else None
            )
            return SyncStatus(
                network=state.network,
                contract_address=state.contract_address,
                status=state.status,
                last_processed_block=state.last_processed_block,
                last_processed_block_hash=state.last_processed_block_hash,
                latest_block=latest,
                behind_by=behind,
                events_indexed=state.events_indexed,
                updated_at=state.updated_at,
            )
        finally:
            session.close()

    def reset_index(self) -> None:
        """Clear all indexed data and the checkpoint (test/dev utility)."""
        session = SessionLocal()
        try:
            session.execute(delete(BlockchainEvent))
            self._reset_read_model(session)
            # Also drop the persisted checkpoint so a reset truly restarts the
            # indexer (and so tests/dev do not leak checkpoint rows between runs).
            session.execute(delete(IndexerState))
            session.commit()
        finally:
            session.close()


class ContinuousIndexer:
    """Polls the chain and advances the index periodically.

    Uses a :class:`threading.Event` so :meth:`stop` returns promptly and the
    application can shut down cleanly.
    """

    def __init__(
        self, manager: SyncManager | None = None, poll_interval: float | None = None
    ) -> None:
        self.manager = manager or SyncManager()
        self.poll_interval = (
            poll_interval
            if poll_interval is not None
            else self.manager.settings.indexer_poll_interval
        )
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        """Start the background polling thread (idempotent)."""
        if self.running:
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="votex-indexer", daemon=True
        )
        self._thread.start()
        logger.info("continuous_indexer_started", extra={"event": "indexer_start"})

    def stop(self, timeout: float = 5.0) -> None:
        """Signal the loop to stop and join the thread."""
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=timeout)
        logger.info("continuous_indexer_stopped", extra={"event": "indexer_stop"})

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.manager.sync_latest()
            except SyncError as exc:
                logger.warning(
                    "indexer_sync_error",
                    extra={"event": "indexer_error", "error": str(exc)},
                )
            except Exception as exc:  # noqa: BLE001
                logger.error(
                    "indexer_unexpected_error",
                    extra={"event": "indexer_error", "error": str(exc)},
                )
            # Wait with a timeout so stop() is responsive.
            self._stop.wait(self.poll_interval)

    def run_iterations(self, iterations: int) -> SyncResult | None:
        """Run a bounded number of sync iterations (useful in tests)."""
        result: SyncResult | None = None
        for _ in range(iterations):
            if self._stop.is_set():
                break
            result = self.manager.sync_latest()
            self._stop.wait(self.poll_interval)
        return result
