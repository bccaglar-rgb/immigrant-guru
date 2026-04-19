from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_admin_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.knowledge import (
    KnowledgeChunkIngestionCreate,
    KnowledgeChunkRead,
    KnowledgeSourceCreate,
    KnowledgeSourceRead,
)
from app.services.knowledge_base_service import KnowledgeBaseService
from app.services.knowledge_ingestion_service import KnowledgeIngestionService

router = APIRouter(prefix="/admin/kb", tags=["admin", "knowledge-base"])

knowledge_ingestion_service = KnowledgeIngestionService(
    knowledge_base_service=KnowledgeBaseService()
)


@router.post(
    "/sources",
    response_model=KnowledgeSourceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a trusted knowledge source",
)
async def create_knowledge_source(
    payload: KnowledgeSourceCreate,
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
) -> KnowledgeSourceRead:
    source = await knowledge_ingestion_service.create_source(session, payload)
    return KnowledgeSourceRead.model_validate(source)


@router.post(
    "/chunks",
    response_model=KnowledgeChunkRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a chunk to an existing trusted knowledge source",
)
async def create_knowledge_chunk(
    payload: KnowledgeChunkIngestionCreate,
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
) -> KnowledgeChunkRead:
    chunk = await knowledge_ingestion_service.add_chunk(
        session,
        source_id=payload.source_id,
        payload=payload,
    )
    return KnowledgeChunkRead.model_validate(chunk)
