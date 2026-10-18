"""Event Processor: projects decoded logs into the indexed read model.

All handlers are idempotent. The raw event row keyed by
(transaction_hash, log_index) is written first; if that row already exists the
entire event is skipped, so vote totals can never be double-counted.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models.blockchain_event import BlockchainEvent
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.vote import Vote
from app.models.voter import Voter
from app.services.blockchain import types as t

logger = get_logger("votex.indexer.processor")


def normalise_address(address: str | None) -> str | None:
    """Lowercase an EVM address for consistent storage/comparison."""
    if address is None:
        return None
    return address.lower()


class EventProcessor:
    """Applies decoded logs to the read model within a session."""

    def __init__(self, session: Session) -> None:
        self.session = session

    # -- Entry point ------------------------------------------------------

    def process(self, log: t.DecodedLog) -> bool:
        """Process one log. Returns True if newly indexed, False if a duplicate."""
        event_type = log.event_type
        if event_type not in t.SUPPORTED_EVENTS:
            logger.warning(
                "unsupported_event_skipped",
                extra={"event": "unsupported_event", "event_type": event_type},
            )
            return False

        # --- Idempotency gate -------------------------------------------
        existing = self.session.scalar(
            select(BlockchainEvent.id).where(
                BlockchainEvent.transaction_hash == log.transaction_hash,
                BlockchainEvent.log_index == log.log_index,
            )
        )
        if existing is not None:
            logger.info(
                "event_already_indexed",
                extra={
                    "event": "duplicate_skipped",
                    "event_type": event_type,
                    "transaction_hash": log.transaction_hash,
                    "block_number": log.block_number,
                },
            )
            return False

        # Persist the raw event record first.
        event_row = BlockchainEvent(
            event_type=event_type,
            contract_address=log.contract_address.lower(),
            transaction_hash=log.transaction_hash,
            block_number=log.block_number,
            block_hash=log.block_hash,
            transaction_index=log.transaction_index,
            log_index=log.log_index,
            payload=log.payload(),
            timestamp=log.timestamp,
        )
        self.session.add(event_row)

        # Project into the read model.
        handler = getattr(self, f"_on_{event_type}", None)
        if handler is not None:
            handler(log.args, log)

        logger.info(
            "event_indexed",
            extra={
                "event": "event_indexed",
                "event_type": event_type,
                "block_number": log.block_number,
                "transaction_hash": log.transaction_hash,
            },
        )
        return True

    # -- Helpers ----------------------------------------------------------

    def _get_or_create_election(self, election_id: int) -> Election:
        election = self.session.scalar(
            select(Election).where(
                Election.blockchain_election_id == election_id
            )
        )
        if election is None:
            election = Election(
                blockchain_election_id=election_id,
                title=f"Election {election_id}",
                description="",
                state="DRAFT",
                state_index=0,
            )
            self.session.add(election)
            self.session.flush()
        return election

    @staticmethod
    def _coerce_int(value: Any) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    # -- Event handlers ---------------------------------------------------

    def _on_ElectionCreated(self, args: dict[str, Any], log: t.DecodedLog) -> None:
        election_id = self._coerce_int(args.get("electionId"))
        election = self._get_or_create_election(election_id)
        election.title = str(args.get("title") or election.title)
        election.creator = normalise_address(args.get("creator"))
        election.created_block = log.block_number
        election.created_tx_hash = log.transaction_hash
        # Attach the deployed instance address if the listener resolved it.
        instance = args.get("_contract_address")
        if instance:
            election.contract_address = instance.lower()
        self.session.flush()

    def _on_CandidateAdded(self, args: dict[str, Any], log: t.DecodedLog) -> None:
        election_id = self._coerce_int(args.get("electionId"))
        candidate_id = self._coerce_int(args.get("candidateId"))
        election = self._get_or_create_election(election_id)

        candidate = self.session.scalar(
            select(Candidate).where(
                Candidate.election_id == election.id,
                Candidate.blockchain_candidate_id == candidate_id,
            )
        )
        if candidate is None:
            candidate = Candidate(
                election_id=election.id,
                blockchain_election_id=election_id,
                blockchain_candidate_id=candidate_id,
                name=str(args.get("name") or f"Candidate {candidate_id}"),
                description="",
                vote_count=0,
                active=True,
                created_block=log.block_number,
                created_tx_hash=log.transaction_hash,
            )
            self.session.add(candidate)
        else:
            candidate.name = str(args.get("name") or candidate.name)
            candidate.active = True
        self.session.flush()

    def _on_CandidateDeactivated(
        self, args: dict[str, Any], log: t.DecodedLog
    ) -> None:
        election_id = self._coerce_int(args.get("electionId"))
        candidate_id = self._coerce_int(args.get("candidateId"))
        election = self._get_or_create_election(election_id)
        candidate = self.session.scalar(
            select(Candidate).where(
                Candidate.election_id == election.id,
                Candidate.blockchain_candidate_id == candidate_id,
            )
        )
        if candidate is not None:
            candidate.active = False
        self.session.flush()

    def _on_VoteCast(self, args: dict[str, Any], log: t.DecodedLog) -> None:
        election_id = self._coerce_int(args.get("electionId"))
        candidate_id = self._coerce_int(args.get("candidateId"))
        voter_address = normalise_address(args.get("voter"))

        election = self._get_or_create_election(election_id)

        # Idempotency for the vote row itself (defence in depth; the event
        # gate already blocks replays within a single processor instance).
        already = self.session.scalar(
            select(Vote.id).where(
                Vote.transaction_hash == log.transaction_hash,
                Vote.log_index == log.log_index,
            )
        )
        if already is not None:
            return

        self.session.add(
            Vote(
                election_id=election.id,
                blockchain_election_id=election_id,
                candidate_id=candidate_id,
                blockchain_candidate_id=candidate_id,
                voter_address=voter_address or "",
                block_number=log.block_number,
                transaction_hash=log.transaction_hash,
                transaction_index=log.transaction_index,
                log_index=log.log_index,
                timestamp=log.timestamp,
                gas_used=args.get("_gas_used"),
            )
        )

        # Increment tallies exactly once per newly indexed vote.
        candidate = self.session.scalar(
            select(Candidate).where(
                Candidate.election_id == election.id,
                Candidate.blockchain_candidate_id == candidate_id,
            )
        )
        if candidate is not None:
            candidate.vote_count = (candidate.vote_count or 0) + 1
        election.total_votes = (election.total_votes or 0) + 1
        self.session.flush()

    def _on_ElectionStateChanged(
        self, args: dict[str, Any], log: t.DecodedLog
    ) -> None:
        election_id = self._coerce_int(args.get("electionId"))
        new_state = self._coerce_int(args.get("newState"))
        election = self._get_or_create_election(election_id)
        if 0 <= new_state < len(t.ELECTION_STATES):
            election.state = t.ELECTION_STATES[new_state]
            election.state_index = new_state
        self.session.flush()

    def _on_VoterRegistered(self, args: dict[str, Any], log: t.DecodedLog) -> None:
        wallet = normalise_address(args.get("voter"))
        if not wallet:
            return
        voter = self.session.scalar(
            select(Voter).where(Voter.wallet_address == wallet)
        )
        commitment = args.get("credentialCommitment")
        if isinstance(commitment, (bytes, bytearray)):
            commitment = "0x" + bytes(commitment).hex()
        if voter is None:
            voter = Voter(
                wallet_address=wallet,
                credential_commitment=commitment,
                active=True,
                registered_at=self._coerce_int(args.get("timestamp")) or None,
                registered_block=log.block_number,
                registered_tx_hash=log.transaction_hash,
            )
            self.session.add(voter)
        else:
            voter.credential_commitment = commitment or voter.credential_commitment
            voter.active = True
        self.session.flush()

    def _on_VoterDeactivated(self, args: dict[str, Any], log: t.DecodedLog) -> None:
        wallet = normalise_address(args.get("voter"))
        if not wallet:
            return
        voter = self.session.scalar(
            select(Voter).where(Voter.wallet_address == wallet)
        )
        if voter is not None:
            voter.active = False
        else:
            self.session.add(
                Voter(wallet_address=wallet, active=False, registered_block=log.block_number)
            )
        self.session.flush()

    def _on_VoterReactivated(self, args: dict[str, Any], log: t.DecodedLog) -> None:
        wallet = normalise_address(args.get("voter"))
        if not wallet:
            return
        voter = self.session.scalar(
            select(Voter).where(Voter.wallet_address == wallet)
        )
        if voter is not None:
            voter.active = True
        self.session.flush()

    def _on_EmergencyAction(self, args: dict[str, Any], log: t.DecodedLog) -> None:
        # No read-model mutation beyond the raw event record; emergency actions
        # are lifecycle signals best surfaced via the audit explorer.
        election_id = self._coerce_int(args.get("electionId"))
        self._get_or_create_election(election_id)
        self.session.flush()

    def _on_EmergencyControllerUpdated(
        self, args: dict[str, Any], log: t.DecodedLog
    ) -> None:
        # Configuration change; retained in the events table for auditing.
        return None
