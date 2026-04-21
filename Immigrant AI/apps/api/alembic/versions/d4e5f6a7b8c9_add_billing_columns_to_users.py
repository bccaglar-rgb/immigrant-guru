"""add billing columns to users

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-20 00:01:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("plan", sa.String(32), nullable=False, server_default="free"),
    )
    op.add_column(
        "users",
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("stripe_session_id", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "stripe_session_id")
    op.drop_column("users", "stripe_customer_id")
    op.drop_column("users", "plan")
