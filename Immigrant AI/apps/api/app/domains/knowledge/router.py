from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.knowledge import KnowledgeSearchRequest, KnowledgeSearchResponse
from app.services.knowledge.knowledge_base_service import KnowledgeBaseService
from app.services.knowledge.knowledge_retrieval_service import (
    KnowledgeRetrievalService,
    build_knowledge_retrieval_service,
)

router = APIRouter(prefix="/kb", tags=["knowledge-base"])


def get_knowledge_retrieval_service() -> KnowledgeRetrievalService:
    try:
        return build_knowledge_retrieval_service(
            get_settings(),
            knowledge_base_service=KnowledgeBaseService(),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post(
    "/search",
    response_model=KnowledgeSearchResponse,
    summary="Search knowledge base chunks with lexical or hybrid retrieval for internal grounding",
)
async def search_knowledge_base(
    payload: KnowledgeSearchRequest,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    knowledge_retrieval_service: KnowledgeRetrievalService = Depends(
        get_knowledge_retrieval_service
    ),
) -> KnowledgeSearchResponse:
    return await knowledge_retrieval_service.search(
        session=session,
        payload=payload,
    )
