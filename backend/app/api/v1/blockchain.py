"""Blockchain connectivity and indexer synchronization endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.services.blockchain.provider import get_provider
from app.services.blockchain.sync_manager import SyncError, SyncManager

router = APIRouter(prefix="/blockchain", tags=["blockchain"])
settings = get_settings()


@router.get(
    "/status",
    summary="RPC / chain connectivity status",
    description=(
        "Reports whether the configured RPC endpoint is reachable and whether "
        "the connected chain id matches configuration. No secrets are exposed."
    ),
)
def blockchain_status() -> dict:
    provider = get_provider()
    snap = provider.status()
    return {
        "connected": snap.connected,
        "chain_id": snap.chain_id,
        "expected_chain_id": snap.expected_chain_id,
        "latest_block": snap.latest_block,
        "rpc": "connected" if snap.connected else "unavailable",
        "factory_address": settings.votex_factory_address or None,
        "error": snap.error,
    }


@router.get(
    "/sync",
    summary="Indexer synchronization status",
    description="Returns the persisted indexer checkpoint and progress.",
)
def sync_status() -> dict:
    manager = SyncManager()
    try:
        status_snap = manager.get_sync_status()
    except SyncError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return {
        "network": status_snap.network,
        "contract_address": status_snap.contract_address,
        "status": status_snap.status,
        "last_processed_block": status_snap.last_processed_block,
        "last_processed_block_hash": status_snap.last_processed_block_hash,
        "latest_block": status_snap.latest_block,
        "behind_by": status_snap.behind_by,
        "events_indexed": status_snap.events_indexed,
        "updated_at": status_snap.updated_at,
    }
