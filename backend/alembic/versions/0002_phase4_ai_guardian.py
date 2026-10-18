"""Phase 4 AI Election Guardian schema.

Revision ID: 0002_phase4_ai_guardian
Revises: 0001_phase3_initial
Create Date: 2026-10-06

Adds the supervisory AI tables: ai_feature_snapshots, ai_alerts, and
ai_risk_assessments. These are advisory, off-chain records only — they never
modify election state, votes, or results.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0002_phase4_ai_guardian"
down_revision = "0001_phase3_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- ai_feature_snapshots --------------------------------------------
    op.create_table(
        "ai_feature_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("election_id", sa.Integer(), nullable=False),
        sa.Column("window_start", sa.BigInteger(), nullable=False),
        sa.Column("window_end", sa.BigInteger(), nullable=False),
        sa.Column("timestamp", sa.BigInteger(), nullable=False),
        sa.Column("vote_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "voting_velocity", sa.Float(), nullable=False, server_default="0"
        ),
        sa.Column("mean_interarrival", sa.Float(), nullable=True),
        sa.Column("median_interarrival", sa.Float(), nullable=True),
        sa.Column("velocity_zscore", sa.Float(), nullable=True),
        sa.Column("candidate_entropy", sa.Float(), nullable=True),
        sa.Column("unique_voters", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("gas_mean", sa.Float(), nullable=True),
        sa.Column("gas_stddev", sa.Float(), nullable=True),
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
            "election_id",
            "window_start",
            "window_end",
            name="uq_ai_feature_window",
        ),
    )
    op.create_index(
        "ix_ai_feature_snapshots_election_id",
        "ai_feature_snapshots",
        ["election_id"],
    )
    op.create_index(
        "ix_ai_feature_election_end",
        "ai_feature_snapshots",
        ["election_id", "window_end"],
    )

    # -- ai_alerts --------------------------------------------------------
    op.create_table(
        "ai_alerts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("election_id", sa.Integer(), nullable=False),
        sa.Column("risk_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "threat_level", sa.String(length=16), nullable=False, server_default="NORMAL"
        ),
        sa.Column("alert_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "detected_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "status", sa.String(length=16), nullable=False, server_default="OPEN"
        ),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dedup_key", sa.String(length=160), nullable=False),
        sa.Column("occurrence_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("window_start", sa.BigInteger(), nullable=True),
        sa.Column("window_end", sa.BigInteger(), nullable=True),
        sa.Column("model_version", sa.String(length=32), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["election_id"], ["elections.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_alerts_election_id", "ai_alerts", ["election_id"])
    op.create_index("ix_ai_alerts_alert_type", "ai_alerts", ["alert_type"])
    op.create_index("ix_ai_alerts_status", "ai_alerts", ["status"])
    op.create_index("ix_ai_alerts_dedup_key", "ai_alerts", ["dedup_key"])
    op.create_index(
        "ix_ai_alerts_election_status", "ai_alerts", ["election_id", "status"]
    )
    op.create_index(
        "ix_ai_alerts_election_detected", "ai_alerts", ["election_id", "detected_at"]
    )

    # -- ai_risk_assessments ---------------------------------------------
    op.create_table(
        "ai_risk_assessments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("election_id", sa.Integer(), nullable=False),
        sa.Column("risk_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "threat_level", sa.String(length=16), nullable=False, server_default="NORMAL"
        ),
        sa.Column(
            "guardian_status",
            sa.String(length=16),
            nullable=False,
            server_default="OFFLINE",
        ),
        sa.Column(
            "model_version", sa.String(length=32), nullable=False, server_default="0.1.0"
        ),
        sa.Column("analysis_window_start", sa.BigInteger(), nullable=False),
        sa.Column("analysis_window_end", sa.BigInteger(), nullable=False),
        sa.Column("signals", sa.JSON(), nullable=False),
        sa.Column("explanation", sa.JSON(), nullable=False),
        sa.Column("feature_snapshot_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["election_id"], ["elections.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["feature_snapshot_id"], ["ai_feature_snapshots.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_risk_assessments_election_id", "ai_risk_assessments", ["election_id"]
    )
    op.create_index(
        "ix_ai_risk_election_created",
        "ai_risk_assessments",
        ["election_id", "created_at"],
    )
    op.create_index(
        "ix_ai_risk_election_window",
        "ai_risk_assessments",
        ["election_id", "analysis_window_end"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_risk_election_window", table_name="ai_risk_assessments")
    op.drop_index("ix_ai_risk_election_created", table_name="ai_risk_assessments")
    op.drop_index(
        "ix_ai_risk_assessments_election_id", table_name="ai_risk_assessments"
    )
    op.drop_table("ai_risk_assessments")

    op.drop_index("ix_ai_alerts_election_detected", table_name="ai_alerts")
    op.drop_index("ix_ai_alerts_election_status", table_name="ai_alerts")
    op.drop_index("ix_ai_alerts_dedup_key", table_name="ai_alerts")
    op.drop_index("ix_ai_alerts_status", table_name="ai_alerts")
    op.drop_index("ix_ai_alerts_alert_type", table_name="ai_alerts")
    op.drop_index("ix_ai_alerts_election_id", table_name="ai_alerts")
    op.drop_table("ai_alerts")

    op.drop_index("ix_ai_feature_election_end", table_name="ai_feature_snapshots")
    op.drop_index(
        "ix_ai_feature_snapshots_election_id", table_name="ai_feature_snapshots"
    )
    op.drop_table("ai_feature_snapshots")
