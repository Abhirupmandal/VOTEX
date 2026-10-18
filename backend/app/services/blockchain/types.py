"""Shared dataclasses for the blockchain indexing layer."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# Canonical event names emitted by the VOTEX core contracts.
ELECTION_CREATED = "ElectionCreated"
EMERGENCY_CONTROLLER_UPDATED = "EmergencyControllerUpdated"
VOTER_REGISTERED = "VoterRegistered"
VOTER_DEACTIVATED = "VoterDeactivated"
VOTER_REACTIVATED = "VoterReactivated"
CANDIDATE_ADDED = "CandidateAdded"
CANDIDATE_DEACTIVATED = "CandidateDeactivated"
VOTE_CAST = "VoteCast"
ELECTION_STATE_CHANGED = "ElectionStateChanged"
EMERGENCY_ACTION = "EmergencyAction"

SUPPORTED_EVENTS: frozenset[str] = frozenset(
    {
        ELECTION_CREATED,
        EMERGENCY_CONTROLLER_UPDATED,
        VOTER_REGISTERED,
        VOTER_DEACTIVATED,
        VOTER_REACTIVATED,
        CANDIDATE_ADDED,
        CANDIDATE_DEACTIVATED,
        VOTE_CAST,
        ELECTION_STATE_CHANGED,
        EMERGENCY_ACTION,
    }
)

# ElectionState enum ordering (must mirror VotexElectionTypes.sol).
ELECTION_STATES: tuple[str, ...] = (
    "DRAFT",
    "REGISTRATION",
    "ACTIVE",
    "PAUSED",
    "ENDED",
    "RESULTS_FINALIZED",
)


def json_safe(value: Any) -> Any:
    """Recursively coerce values into JSON-native types for persistence.

    Decoded ABI arguments frequently contain ``bytes`` (e.g. a voter's
    ``credentialCommitment``); those are not JSON-serializable, so they are
    rendered as ``0x``-prefixed hex strings. Dicts and sequences are walked.
    """
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex()
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    return value


@dataclass
class DecodedLog:
    """A single decoded on-chain log, normalised for persistence."""

    event_type: str
    contract_address: str
    transaction_hash: str
    block_number: int
    block_hash: str | None
    transaction_index: int
    log_index: int
    timestamp: int | None
    args: dict[str, Any] = field(default_factory=dict)

    @property
    def identity(self) -> tuple[str, int]:
        """Idempotency key: (transaction_hash, log_index)."""
        return (self.transaction_hash, self.log_index)

    def payload(self) -> dict[str, Any]:
        """Build the JSON payload persisted on the event row."""
        data = json_safe(dict(self.args))
        data["_meta"] = {
            "contract_address": self.contract_address,
            "block_number": self.block_number,
            "block_hash": self.block_hash,
            "transaction_index": self.transaction_index,
            "log_index": self.log_index,
        }
        return data


@dataclass
class SyncResult:
    """Outcome of a single synchronization run."""

    from_block: int
    to_block: int
    blocks_processed: int
    events_seen: int
    events_indexed: int
    events_skipped: int
    reorg_detected: bool = False
    rewound_to: int | None = None
