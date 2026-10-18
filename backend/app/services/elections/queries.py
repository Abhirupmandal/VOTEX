"""Read-model query helpers for elections, candidates, voters, and votes."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.election import Election
from app.models.vote import Vote
from app.models.voter import Voter


@dataclass
class Page:
    """A generic pagination envelope."""

    items: list
    page: int
    page_size: int
    total: int

    @property
    def pages(self) -> int:
        if self.page_size <= 0:
            return 0
        return (self.total + self.page_size - 1) // self.page_size


def _paginate(total: int, page: int, page_size: int) -> tuple[int, int]:
    page = max(1, page)
    page_size = max(1, page_size)
    offset = (page - 1) * page_size
    return offset, page_size


def list_elections(
    session: Session,
    page: int,
    page_size: int,
    state: str | None = None,
) -> Page:
    """Return a page of elections, newest chain id first."""
    stmt = select(Election)
    count_stmt = select(func.count(Election.id))
    if state:
        stmt = stmt.where(Election.state == state.upper())
        count_stmt = count_stmt.where(Election.state == state.upper())

    total = int(session.scalar(count_stmt) or 0)
    offset, limit = _paginate(total, page, page_size)
    rows = session.scalars(
        stmt.order_by(Election.blockchain_election_id.desc()).offset(offset).limit(limit)
    ).all()
    return Page(items=list(rows), page=page, page_size=page_size, total=total)


def get_election(session: Session, blockchain_election_id: int) -> Election | None:
    """Return an election by its on-chain id, or None."""
    return session.scalar(
        select(Election).where(
            Election.blockchain_election_id == blockchain_election_id
        )
    )


def list_candidates(session: Session, election: Election) -> list[Candidate]:
    """Return all candidates for an election, ordered by chain id."""
    return list(
        session.scalars(
            select(Candidate)
            .where(Candidate.election_id == election.id)
            .order_by(Candidate.blockchain_candidate_id)
        ).all()
    )


def get_candidate(
    session: Session, election: Election, blockchain_candidate_id: int
) -> Candidate | None:
    """Return a single candidate within an election."""
    return session.scalar(
        select(Candidate).where(
            Candidate.election_id == election.id,
            Candidate.blockchain_candidate_id == blockchain_candidate_id,
        )
    )


def list_votes(
    session: Session, election: Election, page: int, page_size: int
) -> Page:
    """Return a page of indexed votes, ordered by block then log index."""
    count_stmt = select(func.count(Vote.id)).where(Vote.election_id == election.id)
    total = int(session.scalar(count_stmt) or 0)
    offset, limit = _paginate(total, page, page_size)
    rows = session.scalars(
        select(Vote)
        .where(Vote.election_id == election.id)
        .order_by(Vote.block_number, Vote.log_index)
        .offset(offset)
        .limit(limit)
    ).all()
    return Page(items=list(rows), page=page, page_size=page_size, total=total)


def get_voter(session: Session, wallet_address: str) -> Voter | None:
    """Return a voter by normalised wallet address."""
    return session.scalar(
        select(Voter).where(Voter.wallet_address == wallet_address.lower())
    )


def count_indexed_votes(session: Session, election: Election) -> int:
    """Count indexed vote rows for an election."""
    return int(
        session.scalar(
            select(func.count(Vote.id)).where(Vote.election_id == election.id)
        )
        or 0
    )


def count_voters(session: Session) -> int:
    """Total registered voters in the read model."""
    return int(session.scalar(select(func.count(Voter.id))) or 0)


def list_voters(
    session: Session,
    page: int,
    page_size: int,
    active: bool | None = None,
) -> Page:
    """Return a page of indexed voters, most recent first."""
    stmt = select(Voter)
    count_stmt = select(func.count(Voter.id))
    if active is not None:
        stmt = stmt.where(Voter.active.is_(active))
        count_stmt = count_stmt.where(Voter.active.is_(active))

    total = int(session.scalar(count_stmt) or 0)
    offset, limit = _paginate(total, page, page_size)
    rows = session.scalars(
        stmt.order_by(Voter.registered_at.desc().nullslast(), Voter.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return Page(items=list(rows), page=page, page_size=page_size, total=total)

