"""Contract ABI loading and instantiation.

ABIs are loaded from the compiled Hardhat artifacts produced in Phase 2 — they
are never hand-written here. Contract *addresses* come exclusively from trusted
configuration; they are never accepted from a public API request.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from web3 import Web3
from web3.contract import Contract

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.services.blockchain.provider import Web3Provider, get_provider

logger = get_logger("votex.blockchain.contracts")


class AbiNotFoundError(RuntimeError):
    """Raised when a compiled ABI artifact cannot be located."""


class ContractNotConfiguredError(RuntimeError):
    """Raised when a required contract address is missing from configuration."""


# Logical name -> artifact path relative to the artifacts directory.
_ARTIFACTS: dict[str, str] = {
    "ElectionFactory": "contracts/core/ElectionFactory.sol/ElectionFactory.json",
    "ElectionInstance": "contracts/core/ElectionInstance.sol/ElectionInstance.json",
    "VoterRegistry": "contracts/core/VoterRegistry.sol/VoterRegistry.json",
    "EmergencyController": (
        "contracts/emergency/EmergencyController.sol/EmergencyController.json"
    ),
    "VotexAccessManager": (
        "contracts/access/VotexAccessManager.sol/VotexAccessManager.json"
    ),
}


def _load_artifact(artifacts_dir: Path, relative: str) -> dict:
    path = artifacts_dir / relative
    if not path.exists():
        raise AbiNotFoundError(
            f"Compiled ABI artifact not found at '{path}'. Run "
            f"'npx hardhat compile' in votex/contracts."
        )
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise AbiNotFoundError(f"Unable to read ABI artifact '{path}': {exc}") from exc


@lru_cache(maxsize=None)
def _cached_abi(artifacts_dir: str, relative: str) -> tuple[dict, ...]:
    """Cache parsed ABI lists keyed by (dir, relative path)."""
    return tuple(_load_artifact(Path(artifacts_dir), relative)["abi"])


def load_abi(name: str, settings: Settings | None = None) -> list[dict]:
    """Return the ABI list for the named contract."""
    if name not in _ARTIFACTS:
        raise AbiNotFoundError(f"Unknown contract artifact '{name}'.")
    settings = settings or get_settings()
    return list(_cached_abi(str(settings.artifacts_path()), _ARTIFACTS[name]))


def load_artifact_full(name: str, settings: Settings | None = None) -> dict:
    """Return the full artifact (abi + bytecode) for deployment scripts."""
    if name not in _ARTIFACTS:
        raise AbiNotFoundError(f"Unknown contract artifact '{name}'.")
    settings = settings or get_settings()
    return _load_artifact(settings.artifacts_path(), _ARTIFACTS[name])


def _normalise_address(address: str, label: str) -> str:
    if not address or not address.strip():
        raise ContractNotConfiguredError(
            f"Contract address for '{label}' is not configured. Set the "
            f"corresponding environment variable."
        )
    if not Web3.is_address(address):
        raise ContractNotConfiguredError(
            f"Contract address for '{label}' is not a valid EVM address."
        )
    return Web3.to_checksum_address(address)


@dataclass
class ContractRegistry:
    """Instantiates and caches contract objects for the configured addresses."""

    settings: Settings
    provider: Web3Provider
    _cache: dict[str, Contract] = field(default_factory=dict)

    # -- Address helpers --------------------------------------------------

    def factory_address(self) -> str:
        return _normalise_address(
            self.settings.votex_factory_address, "VOTEX_FACTORY_ADDRESS"
        )

    def voter_registry_address(self) -> str:
        return _normalise_address(
            self.settings.voter_registry_address, "VOTER_REGISTRY_ADDRESS"
        )

    def emergency_controller_address(self) -> str:
        return _normalise_address(
            self.settings.emergency_controller_address,
            "EMERGENCY_CONTROLLER_ADDRESS",
        )

    def access_manager_address(self) -> str:
        return _normalise_address(
            self.settings.votex_access_manager_address,
            "VOTEX_ACCESS_MANAGER_ADDRESS",
        )

    # -- Contract factories ----------------------------------------------

    @property
    def w3(self) -> Web3:
        return self.provider.w3

    def _build(self, name: str, address: str) -> Contract:
        abi = load_abi(name, self.settings)
        return self.w3.eth.contract(address=address, abi=abi)

    def factory(self) -> Contract:
        if "factory" not in self._cache:
            self._cache["factory"] = self._build(
                "ElectionFactory", self.factory_address()
            )
        return self._cache["factory"]

    def voter_registry(self) -> Contract:
        if "voter_registry" not in self._cache:
            self._cache["voter_registry"] = self._build(
                "VoterRegistry", self.voter_registry_address()
            )
        return self._cache["voter_registry"]

    def emergency_controller(self) -> Contract:
        if "emergency_controller" not in self._cache:
            self._cache["emergency_controller"] = self._build(
                "EmergencyController", self.emergency_controller_address()
            )
        return self._cache["emergency_controller"]

    def access_manager(self) -> Contract:
        if "access_manager" not in self._cache:
            self._cache["access_manager"] = self._build(
                "VotexAccessManager", self.access_manager_address()
            )
        return self._cache["access_manager"]

    def election_instance(self, address: str) -> Contract:
        """Return a contract bound to a specific deployed election address."""
        checksum = _normalise_address(address, "election instance")
        key = f"election:{checksum}"
        if key not in self._cache:
            self._cache[key] = self._build("ElectionInstance", checksum)
        return self._cache[key]

    def clear(self) -> None:
        self._cache.clear()


_registry: ContractRegistry | None = None


def get_registry() -> ContractRegistry:
    """Return the process-wide contract registry singleton."""
    global _registry
    if _registry is None:
        _registry = ContractRegistry(settings=get_settings(), provider=get_provider())
    return _registry
