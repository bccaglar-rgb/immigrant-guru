import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.ai import (
    ActionPrioritizationRequest,
    ActionPrioritizationResponse,
    AlternativeStrategiesRequest,
    AlternativeStrategiesResponse,
    AIStrategyRequest,
    AIStrategyResponse,
    CopilotRequest,
    CopilotResponse,
    CountryComparisonRequest,
    CountryComparisonResponse,
    DocumentAnalysisRequest,
    DocumentAnalysisResponse,
    PathwayProbabilityRequest,
    PathwayProbabilityResponse,
    ProfileWeaknessRequest,
    ProfileWeaknessResponse,
    TimelineSimulationRequest,
    TimelineSimulationResponse,
)
from app.services.ai_client import build_ai_client
from app.services.ai_pathway_probability_service import AIPathwayProbabilityService
from app.services.action_prioritization_service import ActionPrioritizationService
from app.services.alternative_strategies_service import AlternativeStrategiesService
from app.services.ai_orchestrator import AIOrchestrator
from app.services.ai_response_normalizer import AIStrategyResponseNormalizer
from app.services.audit_service import AuditService
from app.services.ai_prompt_builder import (
    ActionPrioritizationPromptBuilder,
    AlternativeStrategiesPromptBuilder,
    CopilotPromptBuilder,
    CountryComparisonPromptBuilder,
    DocumentAnalysisPromptBuilder,
    PathwayProbabilityPromptBuilder,
    ProfileWeaknessPromptBuilder,
    StrategyPromptBuilder,
    TimelineSimulationPromptBuilder,
)
from app.services.case_service import CaseService
from app.services.country_comparison_service import CountryComparisonService
from app.services.copilot_service import CopilotService
from app.services.document_analysis_service import DocumentAnalysisService
from app.services.knowledge_base_service import KnowledgeBaseService
from app.services.knowledge_retrieval_service import build_knowledge_retrieval_service
from app.services.missing_information_service import MissingInformationService
from app.services.profile_service import ProfileService
from app.services.profile_weakness_service import ProfileWeaknessService
from app.services.strategy_confidence_service import StrategyConfidenceService
from app.services.ai_timeline_simulation_service import AITimelineSimulationService

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


def get_pathway_probability_service() -> AIPathwayProbabilityService:
    settings = get_settings()
    return AIPathwayProbabilityService(
        ai_client=build_ai_client(settings),
        profile_service=ProfileService(),
        prompt_builder=PathwayProbabilityPromptBuilder(),
    )


def get_timeline_simulation_service() -> AITimelineSimulationService:
    settings = get_settings()
    return AITimelineSimulationService(
        ai_client=build_ai_client(settings),
        profile_service=ProfileService(),
        prompt_builder=TimelineSimulationPromptBuilder(),
    )


def get_country_comparison_service() -> CountryComparisonService:
    settings = get_settings()
    return CountryComparisonService(
        ai_client=build_ai_client(settings),
        profile_service=ProfileService(),
        prompt_builder=CountryComparisonPromptBuilder(),
    )


def get_alternative_strategies_service() -> AlternativeStrategiesService:
    settings = get_settings()
    return AlternativeStrategiesService(
        ai_client=build_ai_client(settings),
        profile_service=ProfileService(),
        prompt_builder=AlternativeStrategiesPromptBuilder(),
    )


def get_action_prioritization_service() -> ActionPrioritizationService:
    settings = get_settings()
    return ActionPrioritizationService(
        ai_client=build_ai_client(settings),
        case_service=CaseService(),
        profile_service=ProfileService(),
        prompt_builder=ActionPrioritizationPromptBuilder(),
    )


def get_profile_weakness_service() -> ProfileWeaknessService:
    settings = get_settings()
    return ProfileWeaknessService(
        ai_client=build_ai_client(settings),
        profile_service=ProfileService(),
        prompt_builder=ProfileWeaknessPromptBuilder(),
    )


def get_document_analysis_service() -> DocumentAnalysisService:
    settings = get_settings()
    return DocumentAnalysisService(
        ai_client=build_ai_client(settings),
        prompt_builder=DocumentAnalysisPromptBuilder(),
    )


def get_copilot_service() -> CopilotService:
    settings = get_settings()
    return CopilotService(
        ai_client=build_ai_client(settings),
        case_service=CaseService(),
        profile_service=ProfileService(),
        prompt_builder=CopilotPromptBuilder(),
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


@router.post(
    "/pathway-probability",
    response_model=PathwayProbabilityResponse,
    summary="Estimate pathway success probability from the authenticated user's profile",
)
async def generate_pathway_probability(
    payload: PathwayProbabilityRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    pathway_probability_service: AIPathwayProbabilityService = Depends(
        get_pathway_probability_service
    ),
) -> PathwayProbabilityResponse:
    return await pathway_probability_service.evaluate(
        session=session,
        user=current_user,
        payload=payload,
    )


@router.post(
    "/timeline-simulation",
    response_model=TimelineSimulationResponse,
    summary="Estimate pathway timeline duration from the authenticated user's profile",
)
async def generate_timeline_simulation(
    payload: TimelineSimulationRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    timeline_simulation_service: AITimelineSimulationService = Depends(
        get_timeline_simulation_service
    ),
) -> TimelineSimulationResponse:
    return await timeline_simulation_service.simulate(
        session=session,
        user=current_user,
        payload=payload,
    )


@router.post(
    "/country-comparison",
    response_model=CountryComparisonResponse,
    summary="Compare multiple country and pathway options from the authenticated user's profile",
)
async def generate_country_comparison(
    payload: CountryComparisonRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    country_comparison_service: CountryComparisonService = Depends(
        get_country_comparison_service
    ),
) -> CountryComparisonResponse:
    return await country_comparison_service.compare(
        session=session,
        user=current_user,
        payload=payload,
    )


@router.post(
    "/alternative-strategies",
    response_model=AlternativeStrategiesResponse,
    summary="Generate three alternative immigration strategies for a target country",
)
async def generate_alternative_strategies(
    payload: AlternativeStrategiesRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    alternative_strategies_service: AlternativeStrategiesService = Depends(
        get_alternative_strategies_service
    ),
) -> AlternativeStrategiesResponse:
    return await alternative_strategies_service.generate(
        session=session,
        user=current_user,
        payload=payload,
    )


@router.post(
    "/action-priority",
    response_model=ActionPrioritizationResponse,
    summary="Select the single most impactful next action for an immigration case",
)
async def generate_action_priority(
    payload: ActionPrioritizationRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    action_prioritization_service: ActionPrioritizationService = Depends(
        get_action_prioritization_service
    ),
) -> ActionPrioritizationResponse:
    return await action_prioritization_service.prioritize(
        session=session,
        user=current_user,
        payload=payload,
    )


@router.post(
    "/profile-weaknesses",
    response_model=ProfileWeaknessResponse,
    summary="Identify the weakest parts of the authenticated user's profile",
)
async def generate_profile_weaknesses(
    payload: ProfileWeaknessRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    profile_weakness_service: ProfileWeaknessService = Depends(
        get_profile_weakness_service
    ),
) -> ProfileWeaknessResponse:
    return await profile_weakness_service.analyze(
        session=session,
        user=current_user,
        payload=payload,
    )


@router.post(
    "/document-analysis",
    response_model=DocumentAnalysisResponse,
    summary="Analyze extracted document text into structured insights",
)
async def generate_document_analysis(
    payload: DocumentAnalysisRequest,
    current_user: User = Depends(get_current_user),
    document_analysis_service: DocumentAnalysisService = Depends(
        get_document_analysis_service
    ),
) -> DocumentAnalysisResponse:
    del current_user
    return await document_analysis_service.analyze(payload=payload)


@router.post(
    "/copilot",
    response_model=CopilotResponse,
    summary="Generate a practical immigration copilot response",
)
async def generate_copilot_response(
    payload: CopilotRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    copilot_service: CopilotService = Depends(get_copilot_service),
) -> CopilotResponse:
    return await copilot_service.respond(
        session=session,
        user=current_user,
        payload=payload,
    )
