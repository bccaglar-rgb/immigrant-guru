from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.copilot import (
    CopilotMessageCreate,
    CopilotMessageExchangeRead,
    CopilotThreadRead,
)
from app.schemas.document import DocumentAuditResponse, DocumentRead
from app.schemas.immigration_case import (
    ImmigrationCaseCreate,
    ImmigrationCaseRead,
    ImmigrationCaseSummary,
    ImmigrationCaseUpdate,
)
from app.schemas.probability import PathwayProbabilityRead
from app.schemas.scoring import ImmigrationScoreRead
from app.schemas.simulation import CaseSimulationRequest, CaseSimulationResponse
from app.schemas.timeline import CaseTimelineRead
from app.schemas.workspace import CaseWorkspaceRead
from app.services.case_service import CaseService
from app.services.copilot_chat_service import CopilotChatService
from app.services.context_assembler_service import ContextAssemblerService
from app.services.missing_information_service import MissingInformationService
from app.services.pathway_probability_service import PathwayProbabilityService
from app.services.case_workspace_service import CaseWorkspaceService
from app.services.document_service import DocumentService
from app.services.document_audit_service import DocumentAuditService
from app.services.document_job_dispatcher import DocumentJobDispatcher
from app.services.document_storage import LocalDocumentStorage
from app.services.profile_service import ProfileService
from app.services.scoring_service import ScoringService
from app.services.scenario_simulation_service import ScenarioSimulationService
from app.services.timeline_simulation_service import TimelineSimulationService
from app.services.ai_client import build_ai_client
from app.services.ai_prompt_builder import CopilotPromptBuilder
from app.services.action_roadmap_service import ActionRoadmapService
from app.services.document_checklist_service import DocumentChecklistService
from app.services.next_best_action_service import NextBestActionService

router = APIRouter(prefix="/cases", tags=["cases"])
settings = get_settings()
case_service = CaseService()
profile_service = ProfileService()
scoring_service = ScoringService()
pathway_probability_service = PathwayProbabilityService(
    case_service=case_service,
    profile_service=profile_service,
    scoring_service=scoring_service,
    missing_information_service=MissingInformationService(),
)
timeline_simulation_service = TimelineSimulationService(
    case_service=case_service,
    profile_service=profile_service,
    missing_information_service=MissingInformationService(),
    snapshot_ttl_minutes=settings.timeline_snapshot_ttl_minutes,
)
document_service = DocumentService(
    case_service=case_service,
    dispatcher=DocumentJobDispatcher(settings),
    storage=LocalDocumentStorage(settings),
    max_upload_bytes=settings.document_max_upload_bytes,
)
document_audit_service = DocumentAuditService(
    checklist_service=DocumentChecklistService(),
)
workspace_service = CaseWorkspaceService(
    case_service=case_service,
    document_service=document_service,
    missing_information_service=MissingInformationService(),
    pathway_probability_service=pathway_probability_service,
    profile_service=profile_service,
    scoring_service=scoring_service,
    timeline_simulation_service=timeline_simulation_service,
)
scenario_simulation_service = ScenarioSimulationService(
    case_service=case_service,
    profile_service=profile_service,
    scoring_service=scoring_service,
    pathway_probability_service=pathway_probability_service,
    timeline_simulation_service=timeline_simulation_service,
)
context_assembler_service = ContextAssemblerService(
    action_roadmap_service=ActionRoadmapService(),
    case_service=case_service,
    checklist_service=DocumentChecklistService(),
    document_service=document_service,
    missing_information_service=MissingInformationService(),
    next_best_action_service=NextBestActionService(),
    profile_service=profile_service,
    scoring_service=scoring_service,
)


def get_copilot_chat_service() -> CopilotChatService:
    return CopilotChatService(
        ai_client=build_ai_client(settings),
        case_service=case_service,
        context_assembler=context_assembler_service,
        prompt_builder=CopilotPromptBuilder(),
    )


@router.post(
    "",
    response_model=ImmigrationCaseRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create an immigration case",
)
async def create_case(
    payload: ImmigrationCaseCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ImmigrationCaseRead:
    immigration_case = await case_service.create_case(session, current_user, payload)
    return ImmigrationCaseRead.model_validate(immigration_case)


@router.get(
    "",
    response_model=list[ImmigrationCaseSummary],
    summary="List the authenticated user's immigration cases",
)
async def list_cases(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ImmigrationCaseSummary]:
    cases = await case_service.list_cases(session, current_user)
    return [ImmigrationCaseSummary.model_validate(item) for item in cases]


@router.get(
    "/{case_id}",
    response_model=ImmigrationCaseRead,
    summary="Get an immigration case by ID",
)
async def get_case(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ImmigrationCaseRead:
    immigration_case = await case_service.get_case(session, current_user, case_id)
    return ImmigrationCaseRead.model_validate(immigration_case)


@router.get(
    "/{case_id}/score",
    response_model=ImmigrationScoreRead,
    summary="Get a deterministic product score for an immigration case",
)
async def get_case_score(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ImmigrationScoreRead:
    immigration_case = await case_service.get_case(session, current_user, case_id)
    profile = await profile_service.get_or_create_profile(session, current_user)
    return scoring_service.score_case(profile=profile, immigration_case=immigration_case)


@router.get(
    "/{case_id}/probability",
    response_model=PathwayProbabilityRead,
    summary="Get a deterministic pathway probability estimate for an immigration case",
)
async def get_case_probability(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PathwayProbabilityRead:
    return await pathway_probability_service.evaluate_case(
        session=session,
        user=current_user,
        case_id=case_id,
    )


@router.get(
    "/{case_id}/timeline",
    response_model=CaseTimelineRead,
    summary="Get a deterministic timeline estimate for an immigration case",
)
async def get_case_timeline(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> CaseTimelineRead:
    return await timeline_simulation_service.simulate_case(
        session=session,
        user=current_user,
        case_id=case_id,
    )


@router.get(
    "/{case_id}/workspace",
    response_model=CaseWorkspaceRead,
    summary="Get deterministic roadmap, checklist, health, and next-action data for a case",
)
async def get_case_workspace(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> CaseWorkspaceRead:
    return await workspace_service.build_case_workspace(
        session=session,
        user=current_user,
        case_id=case_id,
    )


@router.post(
    "/{case_id}/simulation",
    response_model=CaseSimulationResponse,
    summary="Run a deterministic scenario simulation for an immigration case",
)
async def simulate_case_scenario(
    case_id: UUID,
    payload: CaseSimulationRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> CaseSimulationResponse:
    return await scenario_simulation_service.simulate_case(
        session=session,
        user=current_user,
        case_id=case_id,
        payload=payload,
    )


@router.get(
    "/{case_id}/copilot/thread",
    response_model=CopilotThreadRead,
    summary="Get or create the persistent copilot thread for an immigration case",
)
async def get_case_copilot_thread(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    copilot_chat_service: CopilotChatService = Depends(get_copilot_chat_service),
) -> CopilotThreadRead:
    return await copilot_chat_service.get_or_create_thread(
        session=session,
        user=current_user,
        case_id=case_id,
    )


@router.post(
    "/{case_id}/copilot/messages",
    response_model=CopilotMessageExchangeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Post a user message to the case copilot and persist the assistant reply",
)
async def create_case_copilot_message(
    case_id: UUID,
    payload: CopilotMessageCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    copilot_chat_service: CopilotChatService = Depends(get_copilot_chat_service),
) -> CopilotMessageExchangeRead:
    return await copilot_chat_service.post_user_message(
        session=session,
        user=current_user,
        case_id=case_id,
        payload=payload,
    )


@router.post(
    "/{case_id}/documents",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document for an immigration case",
)
async def upload_case_document(
    case_id: UUID,
    file: UploadFile = File(...),
    document_type: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentRead:
    document = await document_service.upload_case_document(
        session=session,
        user=current_user,
        case_id=case_id,
        upload_file=file,
        document_type=document_type,
    )
    return DocumentRead.model_validate(document)


@router.get(
    "/{case_id}/documents",
    response_model=list[DocumentRead],
    summary="List documents attached to an immigration case",
)
async def list_case_documents(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[DocumentRead]:
    documents = await document_service.list_case_documents(
        session=session,
        user=current_user,
        case_id=case_id,
    )
    return [DocumentRead.model_validate(document) for document in documents]


@router.get(
    "/{case_id}/document-audit",
    response_model=DocumentAuditResponse,
    summary="Audit uploaded case documents for compliance readiness",
)
async def get_case_document_audit(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentAuditResponse:
    immigration_case = await case_service.get_case(session, current_user, case_id)
    profile = await profile_service.get_or_create_profile(session, current_user)
    documents = await document_service.list_case_documents(
        session=session,
        user=current_user,
        case_id=case_id,
    )
    return document_audit_service.audit(
        profile=profile,
        immigration_case=immigration_case,
        documents=documents,
    )


@router.put(
    "/{case_id}",
    response_model=ImmigrationCaseRead,
    summary="Update an immigration case",
)
async def update_case(
    case_id: UUID,
    payload: ImmigrationCaseUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ImmigrationCaseRead:
    immigration_case = await case_service.update_case(
        session,
        current_user,
        case_id,
        payload,
    )
    return ImmigrationCaseRead.model_validate(immigration_case)


@router.delete(
    "/{case_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an immigration case",
)
async def delete_case(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    await case_service.delete_case(session, current_user, case_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
