"""Dual-source results verification.

Compares the OFF-CHAIN INDEXED result against the authoritative ON-CHAIN
result. Any divergence sets ``verification.matches = False`` — the backend never
silently reconciles the two. This is the mechanism that lets VOTEX demonstrate
tamper detection.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models.election import Election
from app.services.blockchain.contracts import get_registry
from app.services.blockchain.provider import get_provider
from app.services.elections import queries

logger = get_logger("votex.verification")


def _indexed_result(session: Session, election: Election) -> dict:
    candidates = queries.list_candidates(session, election)
    tally = {
        c.blockchain_candidate_id: int(c.vote_count or 0)
        for c in candidates
    }
    total_votes = queries.count_indexed_votes(session, election)

    winner_id: int | None = None
    tie = False
    if tally:
        max_votes = max(tally.values())
        leaders = [cid for cid, count in tally.items() if count == max_votes]
        tie = len(leaders) > 1
        winner_id = 0 if tie else leaders[0]

    return {
        "source": "INDEXED",
        "total_votes": total_votes,
        "candidates": [
            {
                "candidate_id": c.blockchain_candidate_id,
                "name": c.name,
                "vote_count": int(c.vote_count or 0),
                "active": c.active,
            }
            for c in candidates
        ],
        "winner_id": winner_id,
        "tie": tie,
    }


def _blockchain_result(election: Election) -> dict | None:
    """Read the authoritative result directly from the election contract."""
    if not election.contract_address:
        return None
    try:
        registry = get_registry()
        contract = registry.election_instance(election.contract_address)
        raw = contract.functions.getElectionResults().call()
        # getElectionResults() -> (uint256[] ids, string[] names, uint256[] votes)
        ids, names, counts = raw
        # The contract tracks the election-wide total separately.
        total = int(contract.functions.getTotalVotes().call())
        candidates = [
            {
                "candidate_id": int(ids[i]),
                "name": str(names[i]),
                "vote_count": int(counts[i]),
            }
            for i in range(len(ids))
        ]

        tally = {int(ids[i]): int(counts[i]) for i in range(len(ids))}
        winner_id: int | None = None
        tie = False
        if tally:
            max_votes = max(tally.values())
            leaders = [cid for cid, c in tally.items() if c == max_votes]
            tie = len(leaders) > 1
            winner_id = 0 if tie else leaders[0]

        return {
            "source": "BLOCKCHAIN",
            "total_votes": int(total),
            "candidates": candidates,
            "winner_id": winner_id,
            "tie": tie,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "blockchain_result_failed",
            extra={
                "event": "verification_chain_read_failed",
                "election_id": election.blockchain_election_id,
                "error": str(exc),
            },
        )
        return None


def verify_election(session: Session, election: Election) -> dict:
    """Return indexed + blockchain results and an explicit comparison."""
    indexed = _indexed_result(session, election)
    on_chain = _blockchain_result(election)

    differences: list[str] = []
    matches = False

    if on_chain is None:
        differences.append("blockchain_result_unavailable")
    else:
        if indexed["total_votes"] != on_chain["total_votes"]:
            differences.append(
                f"total_votes indexed={indexed['total_votes']} "
                f"blockchain={on_chain['total_votes']}"
            )
        if indexed["winner_id"] != on_chain["winner_id"]:
            differences.append(
                f"winner_id indexed={indexed['winner_id']} "
                f"blockchain={on_chain['winner_id']}"
            )
        idx_counts = {
            c["candidate_id"]: c["vote_count"] for c in indexed["candidates"]
        }
        chain_counts = {
            c["candidate_id"]: c["vote_count"] for c in on_chain["candidates"]
        }
        if idx_counts != chain_counts:
            differences.append(
                f"candidate_tallies differ: indexed={idx_counts} "
                f"blockchain={chain_counts}"
            )
        matches = not differences

    verification = {"matches": matches, "differences": differences}
    logger.info(
        "results_verified" if matches else "results_mismatch",
        extra={
            "event": "verification",
            "election_id": election.blockchain_election_id,
            "matches": matches,
        },
    )

    return {
        "election_id": election.blockchain_election_id,
        "indexed_result": indexed,
        "blockchain_result": on_chain,
        "verification": verification,
    }
