from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_admin_user, get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.case_outcome import (
    CaseOutcomeCreate,
    CaseOutcomeRead,
    CaseOutcomeSummaryRead,
    CaseOutcomeUpdate,
)
from app.services.case_outcome_service import CaseOutcomeService

router = APIRouter(tags=["case-outcomes"])


def get_case_outcome_service() -> CaseOutcomeService:
    return CaseOutcomeService()


@router.get(
    "/cases/{case_id}/outcome",
    response_model=CaseOutcomeRead,
    summary="Get the recorded outcome for an immigration case",
)
async def get_case_outcome(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    case_outcome_service: CaseOutcomeService = Depends(get_case_outcome_service),
) -> CaseOutcomeRead:
    outcome = await case_outcome_service.get_case_outcome(
        session=session,
        user=current_user,
        case_id=case_id,
    )
    return CaseOutcomeRead.model_validate(outcome)


@router.post(
    "/cases/{case_id}/outcome",
    response_model=CaseOutcomeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Record the outcome for an immigration case",
)
async def create_case_outcome(
    case_id: UUID,
    payload: CaseOutcomeCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    case_outcome_service: CaseOutcomeService = Depends(get_case_outcome_service),
) -> CaseOutcomeRead:
    outcome = await case_outcome_service.create_case_outcome(
        session=session,
        user=current_user,
        case_id=case_id,
        payload=payload,
    )
    return CaseOutcomeRead.model_validate(outcome)


@router.put(
    "/cases/{case_id}/outcome",
    response_model=CaseOutcomeRead,
    summary="Update the recorded outcome for an immigration case",
)
async def update_case_outcome(
    case_id: UUID,
    payload: CaseOutcomeUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    case_outcome_service: CaseOutcomeService = Depends(get_case_outcome_service),
) -> CaseOutcomeRead:
    outcome = await case_outcome_service.update_case_outcome(
        session=session,
        user=current_user,
        case_id=case_id,
        payload=payload,
    )
    return CaseOutcomeRead.model_validate(outcome)


@router.get(
    "/admin/outcomes/summary",
    response_model=CaseOutcomeSummaryRead,
    summary="Summarize recorded case outcomes",
)
async def summarize_case_outcomes(
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
    case_outcome_service: CaseOutcomeService = Depends(get_case_outcome_service),
) -> CaseOutcomeSummaryRead:
    return await case_outcome_service.summarize_outcomes(session=session)
