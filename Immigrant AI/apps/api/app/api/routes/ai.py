import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.ai import AIStrategyRequest, AIStrategyResponse
from app.services.ai_client import build_ai_client
from app.services.ai_orchestrator import AIOrchestrator
from app.services.ai_response_normalizer import AIStrategyResponseNormalizer
from app.services.audit_service import AuditService
from app.services.ai_prompt_builder import StrategyPromptBuilder
from app.services.case_service import CaseService
from app.services.knowledge_base_service import KnowledgeBaseService
from app.services.knowledge_retrieval_service import build_knowledge_retrieval_service
from app.services.missing_information_service import MissingInformationService
from app.services.profile_service import ProfileService
from app.services.strategy_confidence_service import StrategyConfidenceService

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger("immigrant-ai-api.ai_route")


def get_ai_orchestrator() -> AIOrchestrator:
    settings = get_settings()
    try:
        knowledge_retrieval_service = build_knowledge_retrieval_service(
            settings,
            knowledge_base_service=KnowledgeBaseService(),
        )
    except ValueError as exc:
        logger.warning("ai.grounding_backend_unavailable", exc_info=exc)
        knowledge_retrieval_service = None

    return AIOrchestrator(
        ai_client=build_ai_client(settings),
        audit_service=AuditService(),
        confidence_service=StrategyConfidenceService(),
        case_service=CaseService(),
        knowledge_retrieval_service=knowledge_retrieval_service,
        missing_information_service=MissingInformationService(),
        response_normalizer=AIStrategyResponseNormalizer(),
        profile_service=ProfileService(),
        prompt_builder=StrategyPromptBuilder(),
    )


@router.post(
    "/strategy",
    response_model=AIStrategyResponse,
    summary="Generate AI immigration strategy guidance",
)
async def generate_strategy(
    payload: AIStrategyRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    ai_orchestrator: AIOrchestrator = Depends(get_ai_orchestrator),
) -> AIStrategyResponse:
    return await ai_orchestrator.generate_strategy(
        session=session,
        user=current_user,
        payload=payload,
    )
