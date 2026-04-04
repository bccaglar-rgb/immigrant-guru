"""add knowledge chunk embeddings

Revision ID: a2c4d6e8f102
Revises: f10e2bc7a401
Create Date: 2026-04-04 05:05:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a2c4d6e8f102"
down_revision: str | Sequence[str] | None = "f10e2bc7a401"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(256)")
    op.add_column(
        "knowledge_chunks",
        sa.Column("embedding_provider", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "knowledge_chunks",
        sa.Column("embedding_model", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "knowledge_chunks",
        sa.Column("embedding_dimension", sa.Integer(), nullable=True),
    )
    op.add_column(
        "knowledge_chunks",
        sa.Column("embedding_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_knowledge_chunks_embedding_hnsw
        ON knowledge_chunks
        USING hnsw (embedding vector_cosine_ops)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_knowledge_chunks_embedding_hnsw")
    op.drop_column("knowledge_chunks", "embedding_updated_at")
    op.drop_column("knowledge_chunks", "embedding_dimension")
    op.drop_column("knowledge_chunks", "embedding_model")
    op.drop_column("knowledge_chunks", "embedding_provider")
    op.execute("ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS embedding")
