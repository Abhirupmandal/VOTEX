"""Synthetic voting-telemetry generator for the AI Election Guardian.

Everything produced here is clearly labelled **TEST/DEMO DATA**. It exists so the
guardian can be exercised deterministically (demo + tests) without a live chain.
It is never used implicitly: callers must opt in by invoking these functions and
the generated election is tagged with :data:`DEMO_MARKER`.

Scenarios (all begin with a 60-minute normal baseline so the guardian has enough
observations to leave the ``CALIBRATING`` cold-start state):

* ``normal``                    — steady ~2 votes/min, healthy wallet spread.
* ``gradual_surge``             — a legitimate linear ramp toward the deadline.
* ``burst``                     — 500 votes in 30 seconds.
* ``compressed_interarrival``   — votes arriving ~1s apart.
* ``candidate_concentration``   — most votes funnelled to one candidate.
* ``mixed_anomaly``             — burst + wallet + candidate concentration.
"""

from __future__ import annotations

import hashlib
import random
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.election import Election
from app.models.vote import Vote

# Explicit provenance marker — never insert demo rows into real elections.
DEMO_MARKER = "TEST/DEMO DATA"

SCENARIOS: tuple[str, ...] = (
    "normal",
    "gradual_surge",
    "burst",
    "compressed_interarrival",
    "candidate_concentration",
    "mixed_anomaly",
)

# Default base timestamp (fixed for reproducibility) and window geometry.
DEFAULT_START_TS = 1_700_000_000
WINDOW_SECONDS = 300
BASELINE_MINUTES = 60
BASELINE_PER_MIN = 2
DEFAULT_WALLET_POOL = 1000


def _address(index: int) -> str:
    """Deterministic 42-char checksumless address for a wallet index."""
    return "0x" + f"{index:040x}"


def generate_points(
    scenario: str,
    *,
    start_ts: int = DEFAULT_START_TS,
    n_candidates: int = 4,
    seed: int = 1337,
    wallet_pool: int = DEFAULT_WALLET_POOL,
) -> list[dict[str, Any]]:
    """Return a deterministic list of synthetic vote records (TEST/DEMO DATA).

    Each record is ``{timestamp, voter, candidate_id, gas_used, block_number}``.
    """
    if scenario not in SCENARIOS:
        raise ValueError(
            f"unknown scenario {scenario!r}; choose from {', '.join(SCENARIOS)}"
        )
    rng = random.Random(seed)
    points: list[dict[str, Any]] = []
    block = [start_ts]  # block number counter (mutable closure)

    def emit(ts: int, voter: str, candidate: int, gas: int) -> None:
        block[0] += 1
        points.append(
            {
                "timestamp": int(ts),
                "voter": voter,
                "candidate_id": int(candidate),
                "gas_used": int(gas),
                "block_number": block[0],
            }
        )

    def rand_wallet() -> str:
        return _address(rng.randrange(wallet_pool))

    def candidate_uniform() -> int:
        return rng.randint(1, n_candidates)

    def gas() -> int:
        return 21000 + rng.randint(0, 600)

    # -- 60-minute normal baseline ------------------------------------
    for minute in range(BASELINE_MINUTES):
        if scenario == "gradual_surge":
            # Legitimate ramp: 1 -> 12 votes/min across the window.
            rate = 1 + int((minute / BASELINE_MINUTES) * 11)
        else:
            rate = BASELINE_PER_MIN
        count = max(1, rate + rng.choice([-1, 0, 0, 1]))
        for k in range(count):
            ts = start_ts + minute * 60 + (k * 60 // max(1, count)) + rng.randint(0, 3)
            emit(ts, rand_wallet(), candidate_uniform(), gas())

    if scenario == "normal" or scenario == "gradual_surge":
        return points

    anomaly_start = start_ts + BASELINE_MINUTES * 60

    if scenario == "burst":
        # 500 votes in 30 seconds, mostly distinct wallets.
        for k in range(500):
            ts = anomaly_start + int(k * 30 / 500)
            emit(ts, rand_wallet(), candidate_uniform(), gas())

    elif scenario == "compressed_interarrival":
        # Votes arriving roughly every second for four minutes.
        for k in range(240):
            emit(anomaly_start + k, rand_wallet(), candidate_uniform(), gas())

    elif scenario == "candidate_concentration":
        # ~40 votes spread over the window but ~90% funnelled to candidate 1.
        for k in range(40):
            ts = anomaly_start + int(k * 295 / 40)
            candidate = 1 if rng.random() < 0.9 else candidate_uniform()
            emit(ts, rand_wallet(), candidate, gas())

    elif scenario == "mixed_anomaly":
        # Burst of 300 votes in 60s, 80% to candidate 1, from only 2 wallets.
        ring = [_address(rng.randrange(wallet_pool)) for _ in range(2)]
        for k in range(300):
            ts = anomaly_start + int(k * 60 / 300)
            candidate = 1 if rng.random() < 0.8 else candidate_uniform()
            emit(ts, ring[k % 2], candidate, gas())

    return points


def purge_demo_election(session: Session, blockchain_election_id: int) -> None:
    """Delete an election (and cascade its rows) if it exists. Demo utility."""
    election = session.scalar(
        select(Election).where(
            Election.blockchain_election_id == blockchain_election_id
        )
    )
    if election is not None:
        session.delete(election)
        session.flush()


def ensure_demo_election(
    session: Session,
    *,
    blockchain_election_id: int,
    scenario: str,
    title: str | None = None,
    candidate_names: list[str] | None = None,
    start_ts: int = DEFAULT_START_TS,
    seed: int = 1337,
) -> Election:
    """Create (or replace) a fully populated synthetic election and commit it.

    The election, its candidates, and all votes are tagged ``TEST/DEMO DATA``.
    """
    names = candidate_names or ["Alice", "Bob", "Carol", "Dave"]
    points = generate_points(
        scenario,
        start_ts=start_ts,
        n_candidates=len(names),
        seed=seed,
    )

    purge_demo_election(session, blockchain_election_id)

    end_ts = max(p["timestamp"] for p in points) + 1
    election = Election(
        blockchain_election_id=blockchain_election_id,
        title=title or f"Demo Election #{blockchain_election_id} ({scenario})",
        description=f"{DEMO_MARKER} scenario={scenario}",
        state="ACTIVE",
        state_index=2,
        voting_start=start_ts,
        voting_end=end_ts,
        total_votes=len(points),
        total_registered_voters=len({p["voter"] for p in points}),
        creator="0x" + "00" * 20,
    )
    session.add(election)
    session.flush()

    per_candidate: dict[int, int] = {}
    for candidate_id, name in enumerate(names, start=1):
        session.add(
            Candidate(
                blockchain_candidate_id=candidate_id,
                election_id=election.id,
                blockchain_election_id=blockchain_election_id,
                name=name,
                description=DEMO_MARKER,
                vote_count=0,
                active=True,
            )
        )

    for i, point in enumerate(points):
        per_candidate[point["candidate_id"]] = (
            per_candidate.get(point["candidate_id"], 0) + 1
        )
        tx_hash = (
            "0x"
            + hashlib.sha256(
                f"{blockchain_election_id}:{i}".encode()
            ).hexdigest()
        )
        session.add(
            Vote(
                election_id=election.id,
                blockchain_election_id=blockchain_election_id,
                candidate_id=point["candidate_id"],
                blockchain_candidate_id=point["candidate_id"],
                voter_address=point["voter"],
                block_number=point["block_number"],
                transaction_hash=tx_hash,
                transaction_index=0,
                log_index=0,
                timestamp=point["timestamp"],
                gas_used=point["gas_used"],
            )
        )

    session.flush()

    # Update the indexed (non-authoritative) tallies for realism.
    for candidate in session.scalars(
        select(Candidate).where(Candidate.election_id == election.id)
    ).all():
        candidate.vote_count = per_candidate.get(candidate.blockchain_candidate_id, 0)

    session.commit()
    session.refresh(election)
    return election
