from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_chunk import KnowledgeChunk
from app.services.knowledge.knowledge_embedding_service import KnowledgeEmbeddingProvider


class KnowledgeEmbeddingIngestionService:
    """Async-friendly service for embedding chunks after ingestion or source refresh."""

    def __init__(self, *, embedding_provider: KnowledgeEmbeddingProvider) -> None:
        self._embedding_provider = embedding_provider

    async def embed_chunks(
        self,
        session: AsyncSession,
        *,
        chunk_ids: Sequence[UUID] | None = None,
        source_id: UUID | None = None,
        limit: int = 100,
    ) -> int:
        if self._embedding_provider.provider_name == "disabled":
            return 0

        statement = select(KnowledgeChunk).order_by(KnowledgeChunk.updated_at.desc())
        if chunk_ids:
            statement = statement.where(KnowledgeChunk.id.in_(list(chunk_ids)))
        if source_id:
            statement = statement.where(KnowledgeChunk.source_id == source_id)
        if not chunk_ids:
            statement = statement.limit(limit)

        result = await session.execute(statement)
        chunks = list(result.scalars().all())
        updated = 0

        for chunk in chunks:
            embedding = await self._embedding_provider.embed_text(chunk.chunk_text)
            chunk.embedding = embedding.values
            chunk.embedding_provider = embedding.provider
            chunk.embedding_model = embedding.model
            chunk.embedding_dimension = len(embedding.values)
            chunk.embedding_updated_at = datetime.now(timezone.utc)
            updated += 1

        if updated:
            await session.commit()

        return updated
