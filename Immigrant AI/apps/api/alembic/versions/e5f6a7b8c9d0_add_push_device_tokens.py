"""add push_device_tokens table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-24 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # create_type=False keeps the column reference from re-issuing CREATE
    # TYPE inside create_table; we issue it explicitly with checkfirst=True
    # so a partially-applied prior run leaves the enum reusable.
    push_platform = sa.Enum("ios", "android", "web", name="push_platform", create_type=False)
    sa.Enum("ios", "android", "web", name="push_platform").create(op.get_bind(), checkfirst=True)

    op.create_table(
        "push_device_tokens",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.String(length=512), nullable=False),
        sa.Column("platform", push_platform, nullable=False),
        sa.Column("locale", sa.String(length=16), nullable=True),
        sa.Column("app_version", sa.String(length=32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("token", name="push_device_tokens_token_unique"),
    )
    op.create_index(
        "ix_push_device_tokens_user_id",
        "push_device_tokens",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_push_device_tokens_user_id", table_name="push_device_tokens")
    op.drop_table("push_device_tokens")
    sa.Enum(name="push_platform").drop(op.get_bind(), checkfirst=True)
