from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_feedback import AIFeedback
from app.models.enums import AuditEventType, AuditTargetEntityType
from app.models.user import User
from app.schemas.ai_feedback import AIFeedbackCreate, AIFeedbackRead, AIFeedbackSummaryRead
from app.services.audit_service import AuditService
from app.services.case_service import CaseService


class AIFeedbackService:
    def __init__(
        self,
        *,
        audit_service: AuditService | None = None,
        case_service: CaseService | None = None,
    ) -> None:
        self._audit_service = audit_service or AuditService()
        self._case_service = case_service or CaseService()

    async def submit_feedback(
        self,
        *,
        session: AsyncSession,
        user: User,
        payload: AIFeedbackCreate,
    ) -> AIFeedback:
        immigration_case = await self._case_service.get_case(session, user, payload.case_id)
        feedback = AIFeedback(
            user_id=user.id,
            case_id=immigration_case.id,
            feature=payload.feature,
            rating=payload.rating,
            comment=payload.comment.strip() if payload.comment else None,
            target_id=payload.target_id,
        )
        session.add(feedback)
        await session.commit()
        await session.refresh(feedback)
        await self._audit_service.record_event(
            session,
            actor_user_id=user.id,
            event_type=AuditEventType.AI_FEEDBACK_SUBMITTED,
            target_entity_type=AuditTargetEntityType.AI_FEEDBACK,
            target_entity_id=feedback.id,
            metadata={
                "case_id": feedback.case_id,
                "feature": feedback.feature,
                "rating": feedback.rating,
                "target_id": feedback.target_id,
            },
        )
        return feedback

    async def list_feedback(
        self,
        *,
        session: AsyncSession,
        limit: int = 50,
    ) -> list[AIFeedback]:
        result = await session.execute(
            select(AIFeedback)
            .order_by(AIFeedback.created_at.desc())
            .limit(max(1, min(limit, 200)))
        )
        return list(result.scalars().all())

    async def summarize_feedback(
        self,
        *,
        session: AsyncSession,
        limit: int = 20,
    ) -> AIFeedbackSummaryRead:
        feedback_entries = await self.list_feedback(session=session, limit=200)
        positive = sum(1 for entry in feedback_entries if entry.rating.value == "positive")
        negative = sum(1 for entry in feedback_entries if entry.rating.value == "negative")
        by_feature: dict[str, int] = {}
        for entry in feedback_entries:
            by_feature[entry.feature.value] = by_feature.get(entry.feature.value, 0) + 1

        recent = [AIFeedbackRead.model_validate(entry) for entry in feedback_entries[:limit]]
        return AIFeedbackSummaryRead(
            total_feedback=len(feedback_entries),
            positive_feedback=positive,
            negative_feedback=negative,
            by_feature=by_feature,
            recent_feedback=recent,
            generated_at=datetime.now(timezone.utc),
        )
