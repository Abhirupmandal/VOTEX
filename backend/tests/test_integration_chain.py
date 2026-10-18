"""End-to-end integration test against a REAL local blockchain.

This test deploys the Phase 2 core contracts to a running Hardhat node, drives a
full election workflow on-chain (create -> candidate -> register -> vote), then
runs the backend indexer over the *actual* emitted logs and asserts the read
model matches. The blockchain is never mocked.

Skipped automatically when no JSON-RPC node is reachable at the configured URL,
so the rest of the suite still runs in environments without a chain.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from web3 import Web3

from app.core.config import Settings, get_settings
from app.core.database import SessionLocal
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.vote import Vote
from app.services.blockchain.contracts import (
    ContractRegistry,
    load_artifact_full,
    load_abi,
)
from app.services.blockchain.event_listener import EventListener
from app.services.blockchain.provider import Web3Provider
from app.services.blockchain.sync_manager import SyncManager
from app.services.elections import verification


def _rpc_settings() -> Settings:
    return get_settings()


@pytest.fixture(scope="module")
def w3() -> Web3:
    settings = _rpc_settings()
    provider = Web3Provider(settings=settings)
    if not provider.is_connected() or len(provider.w3.eth.accounts) == 0:
        pytest.skip(
            f"No local unlocked accounts available at {settings.blockchain_rpc_url}; "
            "skipping local-chain integration test."
        )
    return provider.w3


def _deploy(w3: Web3, name: str, *args) -> str:
    artifact = load_artifact_full(name)
    factory = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    tx_hash = factory.constructor(*args).transact({"from": w3.eth.accounts[0]})
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    assert receipt.status == 1
    return receipt.contractAddress


def _increase_time(w3: Web3, seconds: int) -> None:
    w3.provider.make_request("evm_increaseTime", [seconds])
    w3.provider.make_request("evm_mine", [])


@pytest.fixture(scope="module")
def deployed(w3: Web3) -> dict:
    """Deploy the core contracts and return their addresses + abis."""
    deployer = w3.eth.accounts[0]
    access_manager = _deploy(w3, "VotexAccessManager", deployer)
    voter_registry = _deploy(w3, "VoterRegistry", access_manager)
    factory = _deploy(w3, "ElectionFactory", access_manager, voter_registry)
    controller = _deploy(w3, "EmergencyController", access_manager, factory)

    # Wire the emergency controller on the FACTORY (see scripts/deploy.ts).
    factory_contract = w3.eth.contract(
        address=factory, abi=load_abi("ElectionFactory")
    )
    tx = factory_contract.functions.setEmergencyController(controller).transact(
        {"from": deployer}
    )
    w3.eth.wait_for_transaction_receipt(tx)

    am = w3.eth.contract(address=access_manager, abi=load_abi("VotexAccessManager"))
    tx = am.functions.grantRole(
        Web3.keccak(text="VOTEX_ELECTION_MANAGER_ROLE"), deployer
    ).transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)
    tx = am.functions.grantRole(
        Web3.keccak(text="VOTEX_VOTER_REGISTRAR_ROLE"), deployer
    ).transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)

    return {
        "access_manager": access_manager,
        "voter_registry": voter_registry,
        "factory": factory,
        "controller": controller,
        "deploy_block": 0,
        "access_manager_abi": load_abi("VotexAccessManager"),
    }


def test_full_workflow_is_indexed_from_real_chain(w3: Web3, deployed: dict) -> None:
    deployer = w3.eth.accounts[0]
    voter = w3.eth.accounts[1]

    factory = w3.eth.contract(
        address=deployed["factory"], abi=load_abi("ElectionFactory")
    )
    registry = w3.eth.contract(
        address=deployed["voter_registry"], abi=load_abi("VoterRegistry")
    )

    now = int(w3.eth.get_block("latest")["timestamp"])
    tx = factory.functions.createElection(
        "Integration Election", "e2e", now + 10, now + 20, now + 20, now + 100_000
    ).transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)

    election_id = int(factory.functions.totalElections().call())
    election_address = factory.functions.getElectionAddress(election_id).call()
    election = w3.eth.contract(
        address=election_address, abi=load_abi("ElectionInstance")
    )

    tx = election.functions.addCandidate("Alice", "cand").transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)

    tx = election.functions.openRegistration().transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)

    # Advance the chain past the voting window start before activating.
    _increase_time(w3, 30)

    tx = election.functions.startElection().transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)

    tx = registry.functions.registerVoter(
        voter, Web3.keccak(text="credential")
    ).transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)

    tx = election.functions.castVote(election_id, 1).transact({"from": voter})
    receipt = w3.eth.wait_for_transaction_receipt(tx)
    assert receipt.status == 1

    # --- Run the real indexer over the node's actual logs -----------------
    settings = Settings(
        blockchain_rpc_url=get_settings().blockchain_rpc_url,
        blockchain_chain_id=get_settings().blockchain_chain_id,
        votex_factory_address=deployed["factory"],
        voter_registry_address=deployed["voter_registry"],
        emergency_controller_address=deployed["controller"],
        indexer_network="integration-test",
        indexer_start_block=0,
        indexer_confirmations=0,
    )
    provider = Web3Provider(settings=settings)
    registry_obj = ContractRegistry(settings=settings, provider=provider)
    listener = EventListener(registry=registry_obj, provider=provider)
    manager = SyncManager(settings=settings, provider=provider, listener=listener)

    try:
        manager.reset_index()
        result = manager.sync_from_block(0)
        assert result.events_indexed > 0

        session = SessionLocal()
        try:
            indexed = session.scalar(
                select(Election).where(
                    Election.blockchain_election_id == election_id
                )
            )
            assert indexed is not None
            assert indexed.title == "Integration Election"
            assert indexed.contract_address.lower() == election_address.lower()
            assert indexed.total_votes == 1

            candidate = session.scalar(
                select(Candidate).where(
                    Candidate.blockchain_election_id == election_id
                )
            )
            assert candidate is not None
            assert candidate.vote_count == 1

            vote_count = int(session.scalar(select(func.count(Vote.id))) or 0)
            assert vote_count == 1
        finally:
            session.close()

        # --- Idempotency: a second pass must not double-count -------------
        second = manager.sync_latest()
        assert second.events_indexed == 0

        session = SessionLocal()
        try:
            assert int(session.scalar(select(func.count(Vote.id))) or 0) == 1
            indexed = session.scalar(
                select(Election).where(
                    Election.blockchain_election_id == election_id
                )
            )
            assert indexed.total_votes == 1
        finally:
            session.close()

        # --- Dual-source verification must MATCH on the real chain --------
        # This exercises the live getElectionResults()/getTotalVotes() reads, so
        # a contract-side result-shape change can never silently pass.
        session = SessionLocal()
        try:
            row = session.scalar(
                select(Election).where(
                    Election.blockchain_election_id == election_id
                )
            )
            assert row is not None
            outcome = verification.verify_election(session, row)
            assert outcome["blockchain_result"] is not None
            assert outcome["verification"]["matches"] is True, outcome[
                "verification"
            ]["differences"]
        finally:
            session.close()
    finally:
        manager.reset_index()
