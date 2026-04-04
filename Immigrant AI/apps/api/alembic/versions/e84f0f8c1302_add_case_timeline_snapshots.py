"""add case timeline snapshots

Revision ID: e84f0f8c1302
Revises: d3d2f9b1d001
Create Date: 2026-04-03 23:58:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "e84f0f8c1302"
down_revision = "d3d2f9b1d001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "case_timeline_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "simulation_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["immigration_cases.id"],
            name="fk_case_timeline_snapshots_case_id_immigration_cases",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_case_timeline_snapshots"),
    )
    op.create_index(
        "ix_case_timeline_snapshots_case_id",
        "case_timeline_snapshots",
        ["case_id"],
        unique=False,
    )
    op.create_index(
        "ix_case_timeline_snapshots_case_id_generated_at",
        "case_timeline_snapshots",
        ["case_id", "generated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_case_timeline_snapshots_case_id_generated_at",
        table_name="case_timeline_snapshots",
    )
    op.drop_index("ix_case_timeline_snapshots_case_id", table_name="case_timeline_snapshots")
    op.drop_table("case_timeline_snapshots")
