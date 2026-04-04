"""add case probability fields

Revision ID: d3d2f9b1d001
Revises: 7b4fc9b35c4b
Create Date: 2026-04-03 23:45:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "d3d2f9b1d001"
down_revision = "7b4fc9b35c4b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    probability_confidence_enum = postgresql.ENUM(
        "LOW",
        "MEDIUM",
        "HIGH",
        name="pathway_probability_confidence_level",
    )
    probability_confidence_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "immigration_cases",
        sa.Column("probability_score", sa.Numeric(precision=5, scale=2), nullable=True),
    )
    op.add_column(
        "immigration_cases",
        sa.Column(
            "probability_confidence",
            probability_confidence_enum,
            nullable=True,
        ),
    )
    op.add_column(
        "immigration_cases",
        sa.Column(
            "probability_explanation_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_immigration_cases_probability_score_range",
        "immigration_cases",
        "probability_score IS NULL OR (probability_score >= 0 AND probability_score <= 100)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_immigration_cases_probability_score_range",
        "immigration_cases",
        type_="check",
    )
    op.drop_column("immigration_cases", "probability_explanation_json")
    op.drop_column("immigration_cases", "probability_confidence")
    op.drop_column("immigration_cases", "probability_score")

    probability_confidence_enum = postgresql.ENUM(
        "LOW",
        "MEDIUM",
        "HIGH",
        name="pathway_probability_confidence_level",
    )
    probability_confidence_enum.drop(op.get_bind(), checkfirst=True)
