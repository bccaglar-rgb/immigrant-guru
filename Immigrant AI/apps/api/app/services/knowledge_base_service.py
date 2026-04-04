from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_source import KnowledgeSource
from app.models.enums import KnowledgeSourceType
from app.schemas.knowledge import (
    KnowledgeChunkCreate,
    KnowledgeRetrievalQuery,
    KnowledgeSourceCreate,
)


class KnowledgeSourceNotFoundError(LookupError):
    """Raised when a knowledge source cannot be found."""


class KnowledgeBaseService:
    """Manage source ingestion and retrieval-ready filtering before vector search exists."""

    async def create_source(
        self,
        session: AsyncSession,
        payload: KnowledgeSourceCreate,
    ) -> KnowledgeSource:
        source = KnowledgeSource(
            source_name=payload.source_name,
            source_type=payload.source_type,
            country=payload.country,
            visa_type=payload.visa_type,
            language=payload.language,
            authority_level=payload.authority_level,
            published_at=payload.published_at,
            verified_at=payload.verified_at,
            metadata_json=payload.metadata,
        )

        source.chunks = [
            self._build_chunk(source=source, payload=chunk_payload)
            for chunk_payload in payload.chunks
        ]

        session.add(source)
        await session.commit()
        await session.refresh(source, attribute_names=["chunks"])
        return source

    async def add_chunks(
        self,
        session: AsyncSession,
        *,
        source_id: UUID,
        chunks: Sequence[KnowledgeChunkCreate],
    ) -> list[KnowledgeChunk]:
        if not chunks:
            return []

        source = await session.get(KnowledgeSource, source_id)
        if source is None:
            raise KnowledgeSourceNotFoundError(
                f"Knowledge source {source_id} was not found."
            )

        existing_indexes_result = await session.execute(
            select(KnowledgeChunk.chunk_index).where(KnowledgeChunk.source_id == source.id)
        )
        reserved_indexes = set(existing_indexes_result.scalars().all())
        existing_max_index = max(reserved_indexes, default=-1)
        new_chunks = []

        for offset, payload in enumerate(chunks, start=1):
            normalized_index = payload.chunk_index
            if normalized_index in reserved_indexes:
                normalized_index = existing_max_index + offset

            reserved_indexes.add(normalized_index)
            new_chunks.append(
                KnowledgeChunk(
                    source_id=source.id,
                    chunk_index=normalized_index,
                    chunk_text=payload.chunk_text,
                    language=payload.language or source.language,
                    metadata_json=payload.metadata,
                )
            )

        session.add_all(new_chunks)
        await session.commit()

        for chunk in new_chunks:
            await session.refresh(chunk)

        return new_chunks

    async def list_sources(
        self,
        session: AsyncSession,
        *,
        country: str | None = None,
        visa_type: str | None = None,
        source_type: KnowledgeSourceType | None = None,
        limit: int = 50,
    ) -> list[KnowledgeSource]:
        statement: Select[tuple[KnowledgeSource]] = select(KnowledgeSource).order_by(
            KnowledgeSource.verified_at.desc().nullslast(),
            KnowledgeSource.updated_at.desc(),
        )

        if country:
            statement = statement.where(KnowledgeSource.country == country)
        if visa_type:
            statement = statement.where(KnowledgeSource.visa_type == visa_type)
        if source_type:
            statement = statement.where(KnowledgeSource.source_type == source_type)

        result = await session.execute(statement.limit(limit))
        return list(result.scalars().all())

    async def retrieve_chunks(
        self,
        session: AsyncSession,
        query: KnowledgeRetrievalQuery,
    ) -> list[KnowledgeChunk]:
        statement: Select[tuple[KnowledgeChunk]] = (
            select(KnowledgeChunk)
            .join(KnowledgeChunk.source)
            .order_by(
                KnowledgeSource.authority_level.asc(),
                KnowledgeSource.verified_at.desc().nullslast(),
                KnowledgeChunk.chunk_index.asc(),
            )
        )

        statement = self._apply_retrieval_filters(statement, query)
        result = await session.execute(statement.limit(query.limit))
        return list(result.scalars().all())

    async def retrieve_candidate_chunks(
        self,
        session: AsyncSession,
        query: KnowledgeRetrievalQuery,
        *,
        candidate_limit: int,
    ) -> list[KnowledgeChunk]:
        statement: Select[tuple[KnowledgeChunk]] = (
            select(KnowledgeChunk)
            .options(selectinload(KnowledgeChunk.source))
            .join(KnowledgeChunk.source)
            .order_by(
                KnowledgeSource.authority_level.asc(),
                KnowledgeSource.verified_at.desc().nullslast(),
                KnowledgeSource.updated_at.desc(),
                KnowledgeChunk.chunk_index.asc(),
            )
        )

        statement = self._apply_retrieval_filters(statement, query)
        result = await session.execute(statement.limit(candidate_limit))
        return list(result.scalars().unique().all())

    @staticmethod
    def _build_chunk(
        *,
        source: KnowledgeSource,
        payload: KnowledgeChunkCreate,
    ) -> KnowledgeChunk:
        return KnowledgeChunk(
            chunk_index=payload.chunk_index,
            chunk_text=payload.chunk_text,
            language=payload.language or source.language,
            metadata_json=payload.metadata,
        )

    @staticmethod
    def _apply_retrieval_filters(
        statement: Select[tuple[KnowledgeChunk]],
        query: KnowledgeRetrievalQuery,
    ) -> Select[tuple[KnowledgeChunk]]:
        if query.country:
            statement = statement.where(KnowledgeSource.country == query.country)
        if query.visa_type:
            statement = statement.where(KnowledgeSource.visa_type == query.visa_type)
        if query.language:
            statement = statement.where(
                KnowledgeChunk.language == query.language,
            )
        if query.authority_levels:
            statement = statement.where(
                KnowledgeSource.authority_level.in_(query.authority_levels),
            )
        if query.source_types:
            statement = statement.where(
                KnowledgeSource.source_type.in_(query.source_types),
            )
        if query.query_text:
            search_terms = _knowledge_search_terms(query.query_text)
            if search_terms:
                statement = statement.where(
                    or_(
                        *[
                            or_(
                                KnowledgeChunk.chunk_text.ilike(f"%{term}%"),
                                KnowledgeSource.source_name.ilike(f"%{term}%"),
                                KnowledgeSource.visa_type.ilike(f"%{term}%"),
                            )
                            for term in search_terms
                        ]
                    )
                )

        return statement


def _knowledge_search_terms(query_text: str) -> list[str]:
    return [
        term
        for term in {token.strip().lower() for token in query_text.split()}
        if len(term) > 1
    ]
