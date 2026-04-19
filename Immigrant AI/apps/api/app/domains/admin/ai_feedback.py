from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_admin_user, get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.ai_feedback import AIFeedbackCreate, AIFeedbackRead, AIFeedbackSummaryRead
from app.services.ai.ai_feedback_service import AIFeedbackService

router = APIRouter(tags=["ai-feedback"])


def get_ai_feedback_service() -> AIFeedbackService:
    return AIFeedbackService()


@router.post(
    "/ai/feedback",
    response_model=AIFeedbackRead,
    status_code=status.HTTP_201_CREATED,
    summary="Submit feedback for an AI-generated output",
)
async def submit_ai_feedback(
    payload: AIFeedbackCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    ai_feedback_service: AIFeedbackService = Depends(get_ai_feedback_service),
) -> AIFeedbackRead:
    feedback = await ai_feedback_service.submit_feedback(
        session=session,
        user=current_user,
        payload=payload,
    )
    return AIFeedbackRead.model_validate(feedback)


@router.get(
    "/admin/ai/feedback",
    response_model=AIFeedbackSummaryRead,
    summary="List and summarize recent AI feedback",
)
async def list_ai_feedback(
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
    ai_feedback_service: AIFeedbackService = Depends(get_ai_feedback_service),
) -> AIFeedbackSummaryRead:
    return await ai_feedback_service.summarize_feedback(session=session, limit=limit)
