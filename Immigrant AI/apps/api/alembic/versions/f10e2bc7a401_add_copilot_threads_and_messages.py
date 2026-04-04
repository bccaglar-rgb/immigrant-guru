"""add copilot threads and messages

Revision ID: f10e2bc7a401
Revises: e84f0f8c1302
Create Date: 2026-04-04 00:40:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "f10e2bc7a401"
down_revision = "e84f0f8c1302"
branch_labels = None
depends_on = None


def upgrade() -> None:
    copilot_message_role = postgresql.ENUM(
        "user",
        "assistant",
        "system",
        name="copilot_message_role",
    )
    copilot_message_role.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "copilot_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["immigration_cases.id"],
            name="fk_copilot_threads_case_id_immigration_cases",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_copilot_threads_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_copilot_threads"),
        sa.UniqueConstraint("case_id", "user_id", name="uq_copilot_threads_case_user"),
    )
    op.create_index("ix_copilot_threads_case_id", "copilot_threads", ["case_id"], unique=False)
    op.create_index("ix_copilot_threads_user_id", "copilot_threads", ["user_id"], unique=False)

    op.create_table(
        "copilot_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", copilot_message_role, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("length(trim(content)) > 0", name="ck_copilot_messages_content_not_blank"),
        sa.ForeignKeyConstraint(
            ["thread_id"],
            ["copilot_threads.id"],
            name="fk_copilot_messages_thread_id_copilot_threads",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["immigration_cases.id"],
            name="fk_copilot_messages_case_id_immigration_cases",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_copilot_messages_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_copilot_messages"),
    )
    op.create_index(
        "ix_copilot_messages_thread_id",
        "copilot_messages",
        ["thread_id"],
        unique=False,
    )
    op.create_index(
        "ix_copilot_messages_case_id",
        "copilot_messages",
        ["case_id"],
        unique=False,
    )
    op.create_index(
        "ix_copilot_messages_user_id",
        "copilot_messages",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_copilot_messages_user_id", table_name="copilot_messages")
    op.drop_index("ix_copilot_messages_case_id", table_name="copilot_messages")
    op.drop_index("ix_copilot_messages_thread_id", table_name="copilot_messages")
    op.drop_table("copilot_messages")
    op.drop_index("ix_copilot_threads_user_id", table_name="copilot_threads")
    op.drop_index("ix_copilot_threads_case_id", table_name="copilot_threads")
    op.drop_table("copilot_threads")

    copilot_message_role = postgresql.ENUM(
        "user",
        "assistant",
        "system",
        name="copilot_message_role",
    )
    copilot_message_role.drop(op.get_bind(), checkfirst=True)
