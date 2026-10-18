"""Tests for the Web3 provider abstraction (no live network required).

The provider is exercised through a stubbed subclass so connectivity logic can
be validated deterministically without an RPC endpoint.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.services.blockchain.provider import (
    BlockchainUnavailableError,
    ChainIdMismatchError,
    Web3Provider,
)


class _StubProvider(Web3Provider):
    """Deterministic provider that returns canned connectivity values."""

    def __init__(
        self,
        *,
        chain_id: int | None,
        latest_block: int | None,
        connected: bool = True,
        expected_chain_id: int = 31337,
    ) -> None:
        super().__init__(
            settings=Settings(
                blockchain_chain_id=expected_chain_id,
                blockchain_rpc_url="http://127.0.0.1:8545",
            )
        )
        self._chain_id = chain_id
        self._latest_block = latest_block
        self._connected = connected

    def is_connected(self) -> bool:  # type: ignore[override]
        return self._connected

    def get_chain_id(self) -> int:  # type: ignore[override]
        if self._chain_id is None:
            raise BlockchainUnavailableError("Unable to read chain id.")
        return self._chain_id

    def get_latest_block(self) -> int:  # type: ignore[override]
        if self._latest_block is None:
            raise BlockchainUnavailableError("Unable to read latest block.")
        return self._latest_block


def test_status_reports_connected_snapshot() -> None:
    snap = _StubProvider(chain_id=31337, latest_block=42).status()
    assert snap.connected is True
    assert snap.chain_id == 31337
    assert snap.expected_chain_id == 31337
    assert snap.latest_block == 42
    assert snap.error is None


def test_status_when_unreachable_returns_disconnected_without_secrets() -> None:
    snap = _StubProvider(
        chain_id=None, latest_block=None, connected=False
    ).status()
    assert snap.connected is False
    assert snap.chain_id is None
    assert snap.latest_block is None
    assert snap.error == "RPC endpoint unreachable"


def test_status_captures_error_when_reads_fail() -> None:
    snap = _StubProvider(
        chain_id=None, latest_block=None, connected=True
    ).status()
    assert snap.connected is False
    assert snap.error is not None


def test_verify_chain_id_matches_configuration() -> None:
    provider = _StubProvider(chain_id=31337, latest_block=1)
    assert provider.verify_chain_id() == 31337


def test_verify_chain_id_mismatch_raises() -> None:
    provider = _StubProvider(
        chain_id=1, latest_block=1, expected_chain_id=31337
    )
    with pytest.raises(ChainIdMismatchError):
        provider.verify_chain_id()


def test_get_latest_block_raises_when_unavailable() -> None:
    provider = _StubProvider(chain_id=31337, latest_block=None)
    with pytest.raises(BlockchainUnavailableError):
        provider.get_latest_block()


def test_get_block_returns_none_on_failure() -> None:
    provider = _StubProvider(chain_id=31337, latest_block=1)
    # A malformed block number drives the underlying call to raise, which the
    # provider normalises to ``None`` rather than propagating.
    assert provider.get_block(-1) is None


def test_reset_drops_cached_connection() -> None:
    provider = _StubProvider(chain_id=31337, latest_block=1)
    _ = provider.w3  # force lazy construction
    assert provider._w3 is not None
    provider.reset()
    assert provider._w3 is None
