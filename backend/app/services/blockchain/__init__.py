"""Blockchain services package."""

from app.services.blockchain.contracts import (
    AbiNotFoundError,
    ContractNotConfiguredError,
    ContractRegistry,
    get_registry,
    load_abi,
)
from app.services.blockchain.event_listener import EventListener
from app.services.blockchain.event_processor import EventProcessor
from app.services.blockchain.provider import (
    BlockchainUnavailableError,
    ChainIdMismatchError,
    Web3Provider,
    get_provider,
)
from app.services.blockchain.sync_manager import (
    ContinuousIndexer,
    SyncError,
    SyncManager,
)

__all__ = [
    "AbiNotFoundError",
    "ContractNotConfiguredError",
    "ContractRegistry",
    "get_registry",
    "load_abi",
    "EventListener",
    "EventProcessor",
    "BlockchainUnavailableError",
    "ChainIdMismatchError",
    "Web3Provider",
    "get_provider",
    "SyncError",
    "SyncManager",
    "ContinuousIndexer",
]
