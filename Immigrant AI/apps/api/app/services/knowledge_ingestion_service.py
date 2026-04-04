from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_source import KnowledgeSource
from app.schemas.knowledge import KnowledgeChunkCreate, KnowledgeSourceCreate
from app.services.knowledge_base_service import (
    KnowledgeBaseService,
    KnowledgeSourceNotFoundError,
)

MAX_METADATA_DEPTH = 4
MAX_METADATA_ITEMS = 100


class KnowledgeIngestionService:
    """Manual ingestion workflows that can later back document-driven pipelines."""

    def __init__(self, *, knowledge_base_service: KnowledgeBaseService) -> None:
        self._knowledge_base_service = knowledge_base_service

    async def create_source(
        self,
        session: AsyncSession,
        payload: KnowledgeSourceCreate,
    ) -> KnowledgeSource:
        self._validate_metadata(payload.metadata)

        for chunk in payload.chunks:
            self._validate_metadata(chunk.metadata)

        return await self._knowledge_base_service.create_source(session, payload)

    async def add_chunk(
        self,
        session: AsyncSession,
        *,
        source_id: UUID,
        payload: KnowledgeChunkCreate,
    ) -> KnowledgeChunk:
        self._validate_metadata(payload.metadata)

        try:
            chunks = await self._knowledge_base_service.add_chunks(
                session,
                source_id=source_id,
                chunks=[payload],
            )
        except KnowledgeSourceNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        return chunks[0]

    def _validate_metadata(self, value: dict[str, Any]) -> None:
        item_count = self._count_metadata_items(value)
        if item_count > MAX_METADATA_ITEMS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Metadata is too large. Maximum supported nested item count is "
                    f"{MAX_METADATA_ITEMS}."
                ),
            )

        try:
            self._assert_metadata_value(value=value, depth=0)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc

    def _assert_metadata_value(self, *, value: Any, depth: int) -> None:
        if depth > MAX_METADATA_DEPTH:
            raise ValueError(
                f"Metadata nesting is too deep. Maximum supported depth is {MAX_METADATA_DEPTH}."
            )

        if value is None or isinstance(value, (str, int, float, bool)):
            return

        if isinstance(value, Mapping):
            for key, nested_value in value.items():
                if not isinstance(key, str):
                    raise ValueError("Metadata object keys must be strings.")
                self._assert_metadata_value(value=nested_value, depth=depth + 1)
            return

        if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
            for nested_value in value:
                self._assert_metadata_value(value=nested_value, depth=depth + 1)
            return

        raise ValueError(
            "Metadata values must be JSON-compatible primitives, objects, or arrays."
        )

    def _count_metadata_items(self, value: Any) -> int:
        if value is None or isinstance(value, (str, int, float, bool)):
            return 1

        if isinstance(value, Mapping):
            return 1 + sum(self._count_metadata_items(item) for item in value.values())

        if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
            return 1 + sum(self._count_metadata_items(item) for item in value)

        return 1
