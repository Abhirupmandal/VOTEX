"""Web3 provider abstraction.

Owns a single, lazily-initialised ``Web3`` instance and exposes connectivity
checks (RPC reachability, chain-id verification, latest block number). RPC URLs
are read from trusted configuration; credentials are never surfaced in results.
"""

from __future__ import annotations

from dataclasses import dataclass

from web3 import Web3
from web3.providers import HTTPProvider

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger("votex.blockchain.provider")


class BlockchainUnavailableError(RuntimeError):
    """Raised when the RPC endpoint cannot be reached or is misconfigured."""


class ChainIdMismatchError(RuntimeError):
    """Raised when the connected chain id differs from the configured one."""


@dataclass
class ChainStatus:
    """A sanitised snapshot of chain connectivity (no secrets)."""

    connected: bool
    chain_id: int | None
    expected_chain_id: int
    latest_block: int | None
    error: str | None = None


class Web3Provider:
    """Thin, reusable wrapper around a :class:`web3.Web3` HTTP connection."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._w3: Web3 | None = None

    @property
    def settings(self) -> Settings:
        return self._settings

    def _build(self) -> Web3:
        url = self._settings.blockchain_rpc_url
        # HTTPProvider raises on construction for obviously malformed URLs.
        provider = HTTPProvider(
            url, request_kwargs={"timeout": self._settings.blockchain_request_timeout}
        )
        return Web3(provider)

    @property
    def w3(self) -> Web3:
        """Return the (lazily created) Web3 instance."""
        if self._w3 is None:
            self._w3 = self._build()
        return self._w3

    def reset(self) -> None:
        """Drop the cached connection (used by tests)."""
        self._w3 = None

    # -- Connectivity -----------------------------------------------------

    def is_connected(self) -> bool:
        """Return True when the node responds to a basic RPC call."""
        try:
            return bool(self.w3.is_connected())
        except Exception:  # noqa: BLE001 - normalise any transport error
            return False

    def get_chain_id(self) -> int:
        """Return the chain id reported by the node."""
        try:
            return int(self.w3.eth.chain_id)
        except Exception as exc:  # noqa: BLE001
            raise BlockchainUnavailableError(
                "Unable to read chain id from the configured RPC endpoint."
            ) from exc

    def verify_chain_id(self) -> int:
        """Assert the node chain id matches configuration; return it."""
        chain_id = self.get_chain_id()
        expected = self._settings.blockchain_chain_id
        if chain_id != expected:
            raise ChainIdMismatchError(
                f"Connected chain id {chain_id} does not match configured "
                f"chain id {expected}."
            )
        return chain_id

    def get_latest_block(self) -> int:
        """Return the latest block number."""
        try:
            return int(self.w3.eth.block_number)
        except Exception as exc:  # noqa: BLE001
            raise BlockchainUnavailableError(
                "Unable to read the latest block number."
            ) from exc

    def get_block(self, block_number: int):
        """Return a full block, or ``None`` if it cannot be fetched."""
        try:
            return self.w3.eth.get_block(block_number)
        except Exception:  # noqa: BLE001
            return None

    def status(self) -> ChainStatus:
        """Return a sanitised connectivity snapshot for the status endpoint."""
        if not self.is_connected():
            return ChainStatus(
                connected=False,
                chain_id=None,
                expected_chain_id=self._settings.blockchain_chain_id,
                latest_block=None,
                error="RPC endpoint unreachable",
            )
        try:
            chain_id = self.get_chain_id()
            latest = self.get_latest_block()
            return ChainStatus(
                connected=True,
                chain_id=chain_id,
                expected_chain_id=self._settings.blockchain_chain_id,
                latest_block=latest,
            )
        except Exception as exc:  # noqa: BLE001
            return ChainStatus(
                connected=False,
                chain_id=None,
                expected_chain_id=self._settings.blockchain_chain_id,
                latest_block=None,
                error=str(exc),
            )


# Module-level singleton used by the app and scripts.
_provider: Web3Provider | None = None


def get_provider() -> Web3Provider:
    """Return the process-wide provider singleton."""
    global _provider
    if _provider is None:
        _provider = Web3Provider()
    return _provider
