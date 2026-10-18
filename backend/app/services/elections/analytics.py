"""Indexed analytics for a single election."""

from __future__ import annotations

from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.election import Election
from app.models.vote import Vote
from app.models.voter import Voter
from app.services.elections import queries


def build_analytics(session: Session, election: Election) -> dict:
    """Return an OFF-CHAIN INDEXED VIEW analytics payload for an election.

    Turnout is computed against the indexed registered-voter count (a chain-wide
    figure), and votes-by-candidate plus activity-over-time come from indexed
    VoteCast events. These figures are explicitly non-authoritative.
    """
    candidates = queries.list_candidates(session, election)

    votes_by_candidate = [
        {
            "candidate_id": c.blockchain_candidate_id,
            "name": c.name,
            "vote_count": int(c.vote_count or 0),
            "active": c.active,
        }
        for c in candidates
    ]

    # Activity over time: indexed vote counts bucketed by block number.
    rows = session.execute(
        select(Vote.block_number, func.count(Vote.id))
        .where(Vote.election_id == election.id)
        .group_by(Vote.block_number)
        .order_by(Vote.block_number)
    ).all()
    activity_over_time = [
        {"block_number": int(block), "votes": int(count)} for block, count in rows
    ]

    total_votes = queries.count_indexed_votes(session, election)
    registered_voters = int(
        session.scalar(select(func.count(Voter.id))) or 0
    )
    turnout = (
        round(total_votes / registered_voters, 4) if registered_voters else 0.0
    )

    return {
        "election_id": election.blockchain_election_id,
        "source": "OFF-CHAIN INDEXED VIEW",
        "total_votes": total_votes,
        "registered_voters": registered_voters,
        "turnout": turnout,
        "votes_by_candidate": votes_by_candidate,
        "activity_over_time": activity_over_time,
        "state": election.state,
    }


def candidates_vote_distribution(session: Session, election: Election) -> Counter:
    """Return a Counter of candidate id -> indexed vote count."""
    rows = session.execute(
        select(Vote.blockchain_candidate_id, func.count(Vote.id))
        .where(Vote.election_id == election.id)
        .group_by(Vote.blockchain_candidate_id)
    ).all()
    return Counter({int(cid): int(count) for cid, count in rows})
