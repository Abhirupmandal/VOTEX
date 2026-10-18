"""Dev utility: seed the local chain with one complete election workflow.

Creates an election via the deployed `ElectionFactory` (addresses taken from
settings), adds a candidate, opens registration, advances the chain clock,
starts the election, registers a voter, and casts one vote — all as REAL
transactions. The resulting on-chain events are what the indexer and
`scripts/demo_phase3.py` then consume.

This is a convenience for local demos only. It does not touch the database.

Usage (from votex/backend, venv active, local node + core deployed):

    python scripts/seed_local_chain.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running this file directly (``python scripts/seed_local_chain.py``) by
# putting the backend root on sys.path so the ``app`` package is importable.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from web3 import Web3

from app.core.config import get_settings
from app.services.blockchain.contracts import load_abi
from app.services.blockchain.provider import Web3Provider


def _increase_time(w3: Web3, seconds: int) -> None:
    w3.provider.make_request("evm_increaseTime", [seconds])
    w3.provider.make_request("evm_mine", [])


def main() -> int:
    settings = get_settings()
    if not settings.is_indexer_configured:
        print("[ERROR] VOTEX_FACTORY_ADDRESS is not configured.")
        return 2

    provider = Web3Provider(settings=settings)
    if not provider.is_connected():
        print(f"[ERROR] No node reachable at {settings.blockchain_rpc_url}.")
        return 2
    w3 = provider.w3
    deployer = w3.eth.accounts[0]
    voter = w3.eth.accounts[1]

    factory = w3.eth.contract(
        address=w3.to_checksum_address(settings.votex_factory_address),
        abi=load_abi("ElectionFactory"),
    )
    registry = w3.eth.contract(
        address=w3.to_checksum_address(settings.voter_registry_address),
        abi=load_abi("VoterRegistry"),
    )

    # Warm up: mine one block and read its timestamp so we know the node's
    # current clock, then build the whole window with a wide margin entirely in
    # that clock's future. Hardhat stamps each new block with the real time at
    # mining, which can sit well ahead of the previous block on a node that has
    # been idle, so a narrow window is fragile.
    warm = w3.eth.send_transaction(
        {"from": deployer, "to": w3.eth.accounts[2], "value": 1}
    )
    w3.eth.wait_for_transaction_receipt(warm)

    base = int(w3.eth.get_block("latest")["timestamp"])
    registration_start = base + 3600
    registration_end = base + 7200
    voting_start = registration_end
    voting_end = base + 500_000
    tx = factory.functions.createElection(
        "Phase 3 Demo Election",
        "seeded by seed_local_chain.py",
        registration_start,
        registration_end,
        voting_start,
        voting_end,
    ).transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)

    election_id = int(factory.functions.totalElections().call())
    election_address = factory.functions.getElectionAddress(election_id).call()
    election = w3.eth.contract(
        address=election_address, abi=load_abi("ElectionInstance")
    )
    print(f"Election #{election_id} created at {election_address}")

    tx = election.functions.addCandidate("Alice", "candidate one").transact(
        {"from": deployer}
    )
    w3.eth.wait_for_transaction_receipt(tx)
    tx = election.functions.addCandidate("Bob", "candidate two").transact(
        {"from": deployer}
    )
    w3.eth.wait_for_transaction_receipt(tx)

    tx = election.functions.openRegistration().transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)

    _increase_time(w3, 7300)  # move past the registration window / voting start

    tx = election.functions.startElection().transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)

    tx = registry.functions.registerVoter(
        voter, Web3.keccak(text="demo-credential")
    ).transact({"from": deployer})
    w3.eth.wait_for_transaction_receipt(tx)

    tx = election.functions.castVote(election_id, 1).transact({"from": voter})
    receipt = w3.eth.wait_for_transaction_receipt(tx)
    if receipt.status != 1:
        print("[ERROR] castVote transaction failed.")
        return 1

    total_votes = int(election.functions.getTotalVotes().call())
    print(f"Vote cast. On-chain total votes: {total_votes}")
    print("Seeding complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
