"""add OAuth provider columns + nullable password for passwordless / Google / Apple sign-in

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-25 21:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the password_hash NOT-NULL + non-blank check so OAuth / passwordless
    # users can be created without a password.
    op.drop_constraint("password_hash_not_blank", "users", type_="check")
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=True)

    # Per-provider subject IDs (sub claim from Google / Apple). Indexed unique
    # so we can find an existing account by provider identity.
    op.add_column(
        "users",
        sa.Column("google_sub", sa.String(255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("apple_sub", sa.String(255), nullable=True),
    )
    op.create_unique_constraint("users_google_sub_unique", "users", ["google_sub"])
    op.create_unique_constraint("users_apple_sub_unique", "users", ["apple_sub"])

    # An account must have at least one credential — password OR a linked
    # provider. Without this, `update users set password_hash=null` would
    # leave the row unauthenticatable.
    op.create_check_constraint(
        "users_has_credential",
        "users",
        "password_hash IS NOT NULL OR google_sub IS NOT NULL OR apple_sub IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint("users_has_credential", "users", type_="check")
    op.drop_constraint("users_apple_sub_unique", "users", type_="unique")
    op.drop_constraint("users_google_sub_unique", "users", type_="unique")
    op.drop_column("users", "apple_sub")
    op.drop_column("users", "google_sub")
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=False)
    op.create_check_constraint(
        "password_hash_not_blank",
        "users",
        "length(trim(password_hash)) > 0",
    )
