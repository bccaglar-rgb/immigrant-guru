"""add case outcomes and ai feedback

Revision ID: c91d4e2a5501
Revises: a2c4d6e8f102
Create Date: 2026-04-04 07:10:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c91d4e2a5501"
down_revision: str | Sequence[str] | None = "a2c4d6e8f102"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    case_outcome_status = postgresql.ENUM(
        "approved",
        "rejected",
        "withdrawn",
        "pending",
        name="case_outcome_status",
    )
    ai_feature = postgresql.ENUM(
        "strategy",
        "copilot",
        "document_analysis",
        "comparison",
        name="ai_feature",
    )
    ai_feedback_rating = postgresql.ENUM(
        "positive",
        "negative",
        name="ai_feedback_rating",
    )
    case_outcome_status.create(op.get_bind(), checkfirst=True)
    ai_feature.create(op.get_bind(), checkfirst=True)
    ai_feedback_rating.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "case_outcomes",
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "outcome",
            sa.Enum(
                "approved",
                "rejected",
                "withdrawn",
                "pending",
                name="case_outcome_status",
            ),
            nullable=False,
        ),
        sa.Column("duration_months", sa.Integer(), nullable=True),
        sa.Column("final_pathway", sa.String(length=120), nullable=True),
        sa.Column("decision_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("recorded_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "duration_months IS NULL OR duration_months >= 0",
            name=op.f("ck_case_outcomes_duration_months_non_negative"),
        ),
        sa.CheckConstraint(
            "final_pathway IS NULL OR length(trim(final_pathway)) > 0",
            name=op.f("ck_case_outcomes_final_pathway_not_blank"),
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["immigration_cases.id"],
            name=op.f("fk_case_outcomes_case_id_immigration_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by_user_id"],
            ["users.id"],
            name=op.f("fk_case_outcomes_recorded_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_case_outcomes")),
        sa.UniqueConstraint("case_id", name=op.f("uq_case_outcomes_case_id")),
    )
    op.create_index(op.f("ix_case_outcomes_case_id"), "case_outcomes", ["case_id"], unique=True)
    op.create_index(
        op.f("ix_case_outcomes_recorded_by_user_id"),
        "case_outcomes",
        ["recorded_by_user_id"],
        unique=False,
    )

    op.create_table(
        "ai_feedback",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "feature",
            sa.Enum(
                "strategy",
                "copilot",
                "document_analysis",
                "comparison",
                name="ai_feature",
            ),
            nullable=False,
        ),
        sa.Column(
            "rating",
            sa.Enum("positive", "negative", name="ai_feedback_rating"),
            nullable=False,
        ),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "comment IS NULL OR length(trim(comment)) > 0",
            name=op.f("ck_ai_feedback_comment_not_blank"),
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["immigration_cases.id"],
            name=op.f("fk_ai_feedback_case_id_immigration_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_ai_feedback_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_feedback")),
    )
    op.create_index(op.f("ix_ai_feedback_case_id"), "ai_feedback", ["case_id"], unique=False)
    op.create_index(op.f("ix_ai_feedback_feature"), "ai_feedback", ["feature"], unique=False)
    op.create_index(op.f("ix_ai_feedback_rating"), "ai_feedback", ["rating"], unique=False)
    op.create_index(op.f("ix_ai_feedback_target_id"), "ai_feedback", ["target_id"], unique=False)
    op.create_index(op.f("ix_ai_feedback_user_id"), "ai_feedback", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_feedback_user_id"), table_name="ai_feedback")
    op.drop_index(op.f("ix_ai_feedback_target_id"), table_name="ai_feedback")
    op.drop_index(op.f("ix_ai_feedback_rating"), table_name="ai_feedback")
    op.drop_index(op.f("ix_ai_feedback_feature"), table_name="ai_feedback")
    op.drop_index(op.f("ix_ai_feedback_case_id"), table_name="ai_feedback")
    op.drop_table("ai_feedback")

    op.drop_index(
        op.f("ix_case_outcomes_recorded_by_user_id"),
        table_name="case_outcomes",
    )
    op.drop_index(op.f("ix_case_outcomes_case_id"), table_name="case_outcomes")
    op.drop_table("case_outcomes")

    postgresql.ENUM(name="ai_feedback_rating").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="ai_feature").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="case_outcome_status").drop(op.get_bind(), checkfirst=True)
