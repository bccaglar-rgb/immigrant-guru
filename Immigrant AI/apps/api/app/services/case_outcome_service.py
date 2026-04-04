from __future__ import annotations

from datetime import datetime, timezone
from statistics import fmean
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case_outcome import CaseOutcome
from app.models.enums import AuditEventType, AuditTargetEntityType
from app.models.user import User
from app.schemas.case_outcome import (
    CaseOutcomeCreate,
    CaseOutcomeRead,
    CaseOutcomeSummaryRead,
    CaseOutcomeUpdate,
)
from app.services.audit_service import AuditService
from app.services.case_service import CaseService


class CaseOutcomeService:
    def __init__(
        self,
        *,
        audit_service: AuditService | None = None,
        case_service: CaseService | None = None,
    ) -> None:
        self._audit_service = audit_service or AuditService()
        self._case_service = case_service or CaseService()

    async def get_case_outcome(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
    ) -> CaseOutcome:
        immigration_case = await self._case_service.get_case(session, user, case_id)
        result = await session.execute(
            select(CaseOutcome).where(CaseOutcome.case_id == immigration_case.id)
        )
        outcome = result.scalar_one_or_none()
        if outcome is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Case outcome has not been recorded yet.",
            )
        return outcome

    async def create_case_outcome(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
        payload: CaseOutcomeCreate,
    ) -> CaseOutcome:
        immigration_case = await self._case_service.get_case(session, user, case_id)
        existing = await session.execute(
            select(CaseOutcome).where(CaseOutcome.case_id == immigration_case.id)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Case outcome has already been recorded.",
            )

        outcome = CaseOutcome(
            case_id=immigration_case.id,
            outcome=payload.outcome,
            duration_months=payload.duration_months,
            final_pathway=payload.final_pathway.strip() if payload.final_pathway else None,
            decision_date=payload.decision_date,
            notes=payload.notes.strip() if payload.notes else None,
            recorded_by_user_id=user.id,
            recorded_at=datetime.now(timezone.utc),
        )
        session.add(outcome)
        await session.commit()
        await session.refresh(outcome)
        await self._audit_service.record_event(
            session,
            actor_user_id=user.id,
            event_type=AuditEventType.CASE_OUTCOME_RECORDED,
            target_entity_type=AuditTargetEntityType.CASE_OUTCOME,
            target_entity_id=outcome.id,
            metadata={
                "case_id": case_id,
                "outcome": outcome.outcome,
                "final_pathway": outcome.final_pathway,
            },
        )
        return outcome

    async def update_case_outcome(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
        payload: CaseOutcomeUpdate,
    ) -> CaseOutcome:
        outcome = await self.get_case_outcome(session=session, user=user, case_id=case_id)
        updates = payload.model_dump(exclude_unset=True)
        if not updates:
            return outcome

        if "final_pathway" in updates and isinstance(updates["final_pathway"], str):
            updates["final_pathway"] = updates["final_pathway"].strip() or None
        if "notes" in updates and isinstance(updates["notes"], str):
            updates["notes"] = updates["notes"].strip() or None

        for field_name, value in updates.items():
            setattr(outcome, field_name, value)
        outcome.recorded_by_user_id = user.id
        outcome.recorded_at = datetime.now(timezone.utc)

        await session.commit()
        await session.refresh(outcome)
        await self._audit_service.record_event(
            session,
            actor_user_id=user.id,
            event_type=AuditEventType.CASE_OUTCOME_UPDATED,
            target_entity_type=AuditTargetEntityType.CASE_OUTCOME,
            target_entity_id=outcome.id,
            metadata={"case_id": case_id, "updated_fields": sorted(updates.keys())},
        )
        return outcome

    async def summarize_outcomes(self, *, session: AsyncSession) -> CaseOutcomeSummaryRead:
        result = await session.execute(select(CaseOutcome))
        outcomes = list(result.scalars().all())

        by_outcome: dict[str, int] = {}
        by_pathway: dict[str, int] = {}
        durations: list[int] = []

        for outcome in outcomes:
            by_outcome[outcome.outcome.value] = by_outcome.get(outcome.outcome.value, 0) + 1
            pathway_key = outcome.final_pathway or "unspecified"
            by_pathway[pathway_key] = by_pathway.get(pathway_key, 0) + 1
            if outcome.duration_months is not None:
                durations.append(outcome.duration_months)

        return CaseOutcomeSummaryRead(
            total_cases_with_outcomes=len(outcomes),
            by_outcome=by_outcome,
            by_pathway=by_pathway,
            average_duration_months=round(fmean(durations), 1) if durations else None,
            generated_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def serialize(outcome: CaseOutcome) -> CaseOutcomeRead:
        return CaseOutcomeRead.model_validate(outcome)
