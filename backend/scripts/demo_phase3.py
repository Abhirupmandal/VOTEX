"""Phase 3 demo: end-to-end indexer + dual-source verification summary.

This script performs a real synchronization pass against the configured
blockchain, then prints a summary that compares the OFF-CHAIN INDEXED read model
with the authoritative ON-CHAIN result for every indexed election.

It NEVER fabricates results: every number printed is read live from PostgreSQL
and the chain. If a source is unavailable the script says so explicitly and exits
non-zero, so a mismatch or missing dependency is never masked as success.

Usage (from votex/backend, with the venv active and a chain reachable):

    python scripts/demo_phase3.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running this file directly (``python scripts/demo_phase3.py``) by putting
# the backend root on sys.path so the ``app`` package is importable.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.database import SessionLocal, check_database_connection
from app.services.blockchain.provider import Web3Provider
from app.services.blockchain.sync_manager import SyncError, SyncManager
from app.services.elections import queries, verification

_SEPARATOR = "=" * 72


def _print_header(title: str) -> None:
    print(_SEPARATOR)
    print(title)
    print(_SEPARATOR)


def _print_status(label: str, value: object) -> None:
    print(f"  {label:<28}: {value}")


def _check_environment() -> int:
    settings = get_settings()
    _print_header("VOTEX PHASE 3 DEMO — ENVIRONMENT")
    _print_status("Network", settings.indexer_network)
    _print_status("RPC reachable", "checking...")

    provider = Web3Provider(settings=settings)
    status = provider.status()
    _print_status("RPC reachable", status.connected)
    _print_status("Chain id", status.chain_id)
    _print_status("Expected chain id", status.expected_chain_id)
    _print_status("Latest block", status.latest_block)
    _print_status("Factory configured", settings.is_indexer_configured)
    _print_status("Database reachable", check_database_connection())

    if not status.connected:
        print("\n[ERROR] No blockchain node reachable. Cannot run the demo.")
        return 2
    if not check_database_connection():
        print("\n[ERROR] PostgreSQL is not reachable. Cannot run the demo.")
        return 2
    if not settings.is_indexer_configured:
        print(
            "\n[ERROR] VOTEX_FACTORY_ADDRESS is not configured; nothing to index."
        )
        return 2
    return 0


def _print_sync_status(manager: SyncManager, label: str) -> None:
    _print_header(label)
    snapshot = manager.get_sync_status()
    _print_status("Indexer network", snapshot.network)
    _print_status("Tracked contract", snapshot.contract_address)
    _print_status("Status", snapshot.status)
    _print_status("Last processed block", snapshot.last_processed_block)
    _print_status("Latest block", snapshot.latest_block)
    _print_status("Behind by", snapshot.behind_by)
    _print_status("Events indexed (cumulative)", snapshot.events_indexed)


def _verify_all_elections() -> tuple[int, int]:
    """Return (checked, matched) counts across all indexed elections."""
    _print_header("DUAL-SOURCE VERIFICATION (indexed vs on-chain)")
    session = SessionLocal()
    checked = 0
    matched = 0
    try:
        page = queries.list_elections(session, page=1, page_size=1000)
        if not page.items:
            print("  No indexed elections found. Run the indexer against a chain")
            print("  that has at least one election created via the factory.")
            return 0, 0

        for election in page.items:
            result = verification.verify_election(session, election)
            checked += 1
            ok = bool(result["verification"]["matches"])
            matched += 1 if ok else 0
            indexed = result["indexed_result"]
            chain = result["blockchain_result"]

            print(f"\n  Election #{result['election_id']} — {election.title!r}")
            _print_status("Indexed total votes", indexed["total_votes"])
            _print_status(
                "On-chain total votes",
                chain["total_votes"] if chain else "UNAVAILABLE",
            )
            _print_status("Indexed winner id", indexed["winner_id"])
            _print_status(
                "On-chain winner id", chain["winner_id"] if chain else "UNAVAILABLE"
            )
            _print_status("Verification matches", ok)
            if not ok:
                for difference in result["verification"]["differences"]:
                    _print_status("Difference", difference)
    finally:
        session.close()
    return checked, matched


def main() -> int:
    exit_code = _check_environment()
    if exit_code != 0:
        return exit_code

    settings = get_settings()
    manager = SyncManager(settings=settings)

    _print_sync_status(manager, "SYNC STATUS — BEFORE")

    _print_header("RUNNING SYNCHRONIZATION")
    try:
        result = manager.sync_latest()
    except SyncError as exc:
        print(f"  [ERROR] {exc}")
        return 2

    _print_status("From block", result.from_block)
    _print_status("To block", result.to_block)
    _print_status("Blocks processed", result.blocks_processed)
    _print_status("Events seen", result.events_seen)
    _print_status("Events indexed", result.events_indexed)
    _print_status("Events skipped (duplicates)", result.events_skipped)
    _print_status("Reorg detected", result.reorg_detected)

    # A second pass demonstrates idempotency: nothing new should be indexed.
    _print_header("IDEMPOTENCY CHECK — SECOND PASS")
    second = manager.sync_latest()
    _print_status("Events indexed on re-run", second.events_indexed)
    idempotent = second.events_indexed == 0
    _print_status("Idempotent", idempotent)

    checked, matched = _verify_all_elections()

    _print_sync_status(manager, "SYNC STATUS — AFTER")

    _print_header("VERIFICATION SUMMARY")
    _print_status("Elections verified", checked)
    _print_status("Elections matching on-chain", matched)
    _print_status("Idempotent re-index", idempotent)
    if checked == 0:
        print("\n  RESULT: INCONCLUSIVE — no indexed elections to verify.")
        return 1
    if matched != checked:
        print("\n  RESULT: MISMATCH DETECTED — indexed and on-chain disagree.")
        print("  The system never silently reconciles this; investigate above.")
        return 1
    print("\n  RESULT: PASSED — indexed read model matches the blockchain.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
