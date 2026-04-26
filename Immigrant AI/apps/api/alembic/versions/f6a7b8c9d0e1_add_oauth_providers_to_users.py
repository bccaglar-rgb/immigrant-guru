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
    # users can be created without a password. The constraint was created via
    # the project's naming convention (ck_<table>_<name>), so we must drop it
    # by its real DB name, not the unprefixed declarative name.
    op.drop_constraint("ck_users_password_hash_not_blank", "users", type_="check")
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

    # No "has_credential" CHECK here: passwordless email-code is itself an
    # auth method, so a user with only an email row is still reachable. Adding
    # such a CHECK would 409 every passwordless sign-up.


def downgrade() -> None:
    op.drop_constraint("users_apple_sub_unique", "users", type_="unique")
    op.drop_constraint("users_google_sub_unique", "users", type_="unique")
    op.drop_column("users", "apple_sub")
    op.drop_column("users", "google_sub")
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=False)
    op.create_check_constraint(
        "ck_users_password_hash_not_blank",
        "users",
        "length(trim(password_hash)) > 0",
    )
