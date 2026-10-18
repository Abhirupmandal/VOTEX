"""Phase 3 initial schema: elections, candidates, voters, votes, events, state.

Revision ID: 0001_phase3_initial
Revises:
Create Date: 2026-10-06

Creates the complete indexed read-model schema with idempotency constraints and
performance indexes.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_phase3_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- elections --------------------------------------------------------
    op.create_table(
        "elections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("blockchain_election_id", sa.BigInteger(), nullable=False),
        sa.Column("contract_address", sa.String(length=42), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("registration_start", sa.BigInteger(), nullable=True),
        sa.Column("registration_end", sa.BigInteger(), nullable=True),
        sa.Column("voting_start", sa.BigInteger(), nullable=True),
        sa.Column("voting_end", sa.BigInteger(), nullable=True),
        sa.Column("state", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("state_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_votes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "total_registered_voters",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("creator", sa.String(length=42), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("created_block", sa.BigInteger(), nullable=True),
        sa.Column("created_tx_hash", sa.String(length=66), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_elections_blockchain_election_id",
        "elections",
        ["blockchain_election_id"],
        unique=True,
    )
    op.create_index("ix_elections_contract_address", "elections", ["contract_address"])
    op.create_index("ix_elections_created_tx_hash", "elections", ["created_tx_hash"])
    op.create_index("ix_elections_state", "elections", ["state"])
    op.create_index("ix_elections_created_block", "elections", ["created_block"])

    # -- candidates -------------------------------------------------------
    op.create_table(
        "candidates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("blockchain_candidate_id", sa.BigInteger(), nullable=False),
        sa.Column("election_id", sa.Integer(), nullable=False),
        sa.Column("blockchain_election_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("vote_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("created_block", sa.BigInteger(), nullable=True),
        sa.Column("created_tx_hash", sa.String(length=66), nullable=True),
        sa.ForeignKeyConstraint(
            ["election_id"], ["elections.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "election_id",
            "blockchain_candidate_id",
            name="uq_candidates_election_chain_id",
        ),
    )
    op.create_index("ix_candidates_election_id", "candidates", ["election_id"])

    # -- voters -----------------------------------------------------------
    op.create_table(
        "voters",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("wallet_address", sa.String(length=42), nullable=False),
        sa.Column("credential_commitment", sa.String(length=66), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("registered_at", sa.BigInteger(), nullable=True),
        sa.Column("registered_block", sa.BigInteger(), nullable=True),
        sa.Column("registered_tx_hash", sa.String(length=66), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_voters_wallet_address",
        "voters",
        ["wallet_address"],
        unique=True,
    )
    op.create_index("ix_voters_registered_block", "voters", ["registered_block"])
    op.create_index("ix_voters_registered_tx_hash", "voters", ["registered_tx_hash"])
    op.create_index("ix_voters_active", "voters", ["active"])

    # -- votes ------------------------------------------------------------
    op.create_table(
        "votes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("election_id", sa.Integer(), nullable=False),
        sa.Column("blockchain_election_id", sa.BigInteger(), nullable=False),
        sa.Column("candidate_id", sa.BigInteger(), nullable=False),
        sa.Column("blockchain_candidate_id", sa.BigInteger(), nullable=False),
        sa.Column("voter_address", sa.String(length=42), nullable=False),
        sa.Column("block_number", sa.BigInteger(), nullable=False),
        sa.Column("transaction_hash", sa.String(length=66), nullable=False),
        sa.Column("transaction_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("log_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("timestamp", sa.BigInteger(), nullable=True),
        sa.Column("gas_used", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["election_id"], ["elections.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "transaction_hash", "log_index", name="uq_votes_tx_log"
        ),
    )
    op.create_index("ix_votes_election_id", "votes", ["election_id"])
    op.create_index("ix_votes_candidate_id", "votes", ["candidate_id"])
    op.create_index("ix_votes_voter_address", "votes", ["voter_address"])
    op.create_index("ix_votes_block_number", "votes", ["block_number"])
    op.create_index("ix_votes_transaction_hash", "votes", ["transaction_hash"])
    op.create_index("ix_votes_election_block", "votes", ["election_id", "block_number"])

    # -- blockchain_events ------------------------------------------------
    op.create_table(
        "blockchain_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("contract_address", sa.String(length=42), nullable=False),
        sa.Column("transaction_hash", sa.String(length=66), nullable=False),
        sa.Column("block_number", sa.BigInteger(), nullable=False),
        sa.Column("block_hash", sa.String(length=66), nullable=True),
        sa.Column("transaction_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("log_index", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("timestamp", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "transaction_hash", "log_index", name="uq_events_tx_log"
        ),
    )
    op.create_index(
        "ix_blockchain_events_event_type", "blockchain_events", ["event_type"]
    )
    op.create_index(
        "ix_blockchain_events_contract_address",
        "blockchain_events",
        ["contract_address"],
    )
    op.create_index(
        "ix_blockchain_events_transaction_hash",
        "blockchain_events",
        ["transaction_hash"],
    )
    op.create_index(
        "ix_blockchain_events_block_number", "blockchain_events", ["block_number"]
    )
    op.create_index(
        "ix_blockchain_events_timestamp", "blockchain_events", ["timestamp"]
    )
    op.create_index(
        "ix_events_block_log", "blockchain_events", ["block_number", "log_index"]
    )
    op.create_index(
        "ix_events_contract_block",
        "blockchain_events",
        ["contract_address", "block_number"],
    )

    # -- indexer_state ----------------------------------------------------
    op.create_table(
        "indexer_state",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("network", sa.String(length=64), nullable=False),
        sa.Column("contract_address", sa.String(length=42), nullable=False),
        sa.Column("indexer_key", sa.String(length=128), nullable=False),
        sa.Column(
            "last_processed_block", sa.BigInteger(), nullable=False, server_default="0"
        ),
        sa.Column("last_processed_block_hash", sa.String(length=66), nullable=True),
        sa.Column(
            "events_indexed", sa.BigInteger(), nullable=False, server_default="0"
        ),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="IDLE"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("indexer_key", name="uq_indexer_state_key"),
    )
    op.create_index("ix_indexer_state_network", "indexer_state", ["network"])


def downgrade() -> None:
    op.drop_index("ix_indexer_state_network", table_name="indexer_state")
    op.drop_table("indexer_state")

    op.drop_index("ix_events_contract_block", table_name="blockchain_events")
    op.drop_index("ix_events_block_log", table_name="blockchain_events")
    op.drop_index("ix_blockchain_events_timestamp", table_name="blockchain_events")
    op.drop_index("ix_blockchain_events_block_number", table_name="blockchain_events")
    op.drop_index(
        "ix_blockchain_events_transaction_hash", table_name="blockchain_events"
    )
    op.drop_index(
        "ix_blockchain_events_contract_address", table_name="blockchain_events"
    )
    op.drop_index("ix_blockchain_events_event_type", table_name="blockchain_events")
    op.drop_table("blockchain_events")

    op.drop_index("ix_votes_election_block", table_name="votes")
    op.drop_index("ix_votes_transaction_hash", table_name="votes")
    op.drop_index("ix_votes_block_number", table_name="votes")
    op.drop_index("ix_votes_voter_address", table_name="votes")
    op.drop_index("ix_votes_candidate_id", table_name="votes")
    op.drop_index("ix_votes_election_id", table_name="votes")
    op.drop_table("votes")

    op.drop_index("ix_voters_active", table_name="voters")
    op.drop_index("ix_voters_registered_tx_hash", table_name="voters")
    op.drop_index("ix_voters_registered_block", table_name="voters")
    op.drop_index("ix_voters_wallet_address", table_name="voters")
    op.drop_table("voters")

    op.drop_index("ix_candidates_election_id", table_name="candidates")
    op.drop_table("candidates")

    op.drop_index("ix_elections_created_block", table_name="elections")
    op.drop_index("ix_elections_state", table_name="elections")
    op.drop_index("ix_elections_created_tx_hash", table_name="elections")
    op.drop_index("ix_elections_contract_address", table_name="elections")
    op.drop_index("ix_elections_blockchain_election_id", table_name="elections")
    op.drop_table("elections")
