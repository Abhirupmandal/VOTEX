"""Event Listener: fetches and decodes VOTEX contract logs.

Discovers the set of relevant contract addresses (factory, voter registry,
emergency controller, and every deployed ElectionInstance), pulls logs for a
block range, and decodes them into :class:`DecodedLog` objects. No read-model
mutation happens here — that is the Event Processor's job.
"""

from __future__ import annotations

from typing import Any

from web3 import Web3
from web3.contract import Contract

from app.core.logging import get_logger
from app.services.blockchain import types as t
from app.services.blockchain.contracts import (
    ContractRegistry,
    get_registry,
    load_abi,
)
from app.services.blockchain.provider import Web3Provider, get_provider

logger = get_logger("votex.indexer.listener")


class EventListener:
    """Reads and decodes VOTEX events for a given block range."""

    def __init__(
        self,
        registry: ContractRegistry | None = None,
        provider: Web3Provider | None = None,
    ) -> None:
        self.registry = registry or get_registry()
        self.provider = provider or get_provider()

    @property
    def w3(self) -> Web3:
        return self.provider.w3

    # -- Address discovery ------------------------------------------------

    def discover_election_addresses(self) -> list[str]:
        """Return every ElectionInstance address known to the factory.

        Reads authoritative state directly from the chain; failure to reach the
        factory yields an empty list rather than crashing the listener.
        """
        try:
            factory = self.registry.factory()
            total = int(factory.functions.totalElections().call())
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "election_discovery_failed",
                extra={"event": "election_discovery_failed", "error": str(exc)},
            )
            return []

        addresses: list[str] = []
        for idx in range(total):
            try:
                _, addr = factory.functions.getElectionAt(idx).call()
                if addr and int(addr, 16) != 0:
                    addresses.append(Web3.to_checksum_address(addr))
            except Exception:  # noqa: BLE001
                continue
        return addresses

    def _tracked_addresses(self) -> list[str]:
        addresses: list[str] = []
        # Configured singletons (ignore any that are not set).
        for getter in (
            self.registry.factory_address,
            self.registry.voter_registry_address,
            self.registry.emergency_controller_address,
        ):
            try:
                addresses.append(getter())
            except Exception:  # noqa: BLE001
                continue
        addresses.extend(self.discover_election_addresses())
        # De-duplicate while preserving order.
        seen: set[str] = set()
        unique: list[str] = []
        for addr in addresses:
            if addr not in seen:
                seen.add(addr)
                unique.append(addr)
        return unique

    # -- Decoding ---------------------------------------------------------

    def _topic_maps(self) -> dict[str, dict[str, tuple[str, Any]]]:
        """Map contract address -> {topic0 -> (event_name, contract_event)}."""
        maps: dict[str, dict[str, tuple[str, Any]]] = {}

        def build(contract: Contract) -> dict[str, tuple[str, Any]]:
            mapping: dict[str, tuple[str, Any]] = {}
            for item in contract.abi:
                if item.get("type") != "event":
                    continue
                name = item["name"]
                try:
                    event = contract.events[name]()
                except Exception:  # noqa: BLE001
                    continue
                mapping[event.topic] = (name, event)
            return mapping

        # Singletons.
        for getter in (
            self.registry.factory,
            self.registry.voter_registry,
            self.registry.emergency_controller,
        ):
            try:
                contract = getter()
                maps[contract.address.lower()] = build(contract)
            except Exception:  # noqa: BLE001
                continue

        # Election instances share the same ABI but live at distinct addresses.
        abi = load_abi("ElectionInstance", self.registry.settings)
        for address in self.discover_election_addresses():
            contract = self.w3.eth.contract(address=address, abi=abi)
            maps[address.lower()] = build(contract)

        return maps

    # -- Fetching ---------------------------------------------------------

    def fetch_decoded_logs(
        self, from_block: int, to_block: int
    ) -> list[t.DecodedLog]:
        """Fetch and decode all tracked logs in ``[from_block, to_block]``."""
        addresses = self._tracked_addresses()
        if not addresses:
            logger.info(
                "no_tracked_addresses",
                extra={"event": "no_tracked_addresses"},
            )
            return []

        raw_logs = self.w3.eth.get_logs(
            {
                "fromBlock": from_block,
                "toBlock": to_block,
                "address": addresses,
            }
        )

        topic_maps = self._topic_maps()
        # Cache block timestamps to avoid repeat RPC calls.
        block_timestamps: dict[int, int] = {}
        tx_gas: dict[str, int] = {}

        decoded: list[t.DecodedLog] = []
        for raw in raw_logs:
            if raw.get("removed"):
                # A removed log belongs to a reorged-away block; skip it and let
                # the sync manager rewind.
                logger.warning(
                    "removed_log_encountered",
                    extra={
                        "event": "removed_log",
                        "transaction_hash": raw["transactionHash"].hex(),
                    },
                )
                continue

            address = raw["address"].lower()
            mapping = topic_maps.get(address)
            if not mapping:
                continue
            topics = raw["topics"]
            if not topics:
                continue
            topic0 = topics[0].hex() if isinstance(topics[0], bytes) else topics[0]
            if topic0.startswith("0x"):
                topic0_hex = topic0
            else:
                topic0_hex = "0x" + topic0
            entry = mapping.get(topic0_hex)
            if entry is None:
                continue
            name, event = entry

            try:
                decoded_event = event.process_log(raw)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "log_decode_failed",
                    extra={"event": "log_decode_failed", "error": str(exc)},
                )
                continue

            block_number = int(raw["blockNumber"])
            timestamp = block_timestamps.get(block_number)
            if timestamp is None:
                block = self.provider.get_block(block_number)
                timestamp = int(block["timestamp"]) if block else None
                if timestamp is not None:
                    block_timestamps[block_number] = timestamp

            args: dict[str, Any] = dict(decoded_event["args"])
            tx_hash = raw["transactionHash"].hex()
            if not tx_hash.startswith("0x"):
                tx_hash = "0x" + tx_hash

            # Attach deployed instance address to ElectionCreated events.
            if name == t.ELECTION_CREATED:
                try:
                    instance = self.registry.factory().functions.getElectionAddress(
                        int(args.get("electionId"))
                    ).call()
                    if instance and int(instance, 16) != 0:
                        args["_contract_address"] = Web3.to_checksum_address(instance)
                except Exception:  # noqa: BLE001
                    pass

            # Attach gas used for vote events (one receipt lookup per tx).
            if name == t.VOTE_CAST:
                gas = tx_gas.get(tx_hash)
                if gas is None:
                    try:
                        receipt = self.w3.eth.get_transaction_receipt(tx_hash)
                        gas = int(receipt["gasUsed"])
                        tx_gas[tx_hash] = gas
                    except Exception:  # noqa: BLE001
                        gas = None
                if gas is not None:
                    args["_gas_used"] = gas

            decoded.append(
                t.DecodedLog(
                    event_type=name,
                    contract_address=raw["address"],
                    transaction_hash=tx_hash,
                    block_number=block_number,
                    block_hash=(
                        raw["blockHash"].hex()
                        if isinstance(raw.get("blockHash"), (bytes, bytearray))
                        else raw.get("blockHash")
                    ),
                    transaction_index=int(raw["transactionIndex"]),
                    log_index=int(raw["logIndex"]),
                    timestamp=timestamp,
                    args=args,
                )
            )

        # Deterministic ordering: block, then log index.
        decoded.sort(key=lambda d: (d.block_number, d.log_index))
        return decoded
