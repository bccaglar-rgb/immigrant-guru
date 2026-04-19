from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.immigration_case import ImmigrationCase
from app.models.enums import AuditEventType, AuditTargetEntityType
from app.models.user import User
from app.schemas.immigration_case import ImmigrationCaseCreate, ImmigrationCaseUpdate
from app.services.shared.audit_service import AuditService


class CaseService:
    """Manage immigration cases owned by authenticated users."""

    def __init__(self, *, audit_service: AuditService | None = None) -> None:
        self._audit_service = audit_service or AuditService()

    async def create_case(
        self,
        session: AsyncSession,
        user: User,
        payload: ImmigrationCaseCreate,
    ) -> ImmigrationCase:
        immigration_case = ImmigrationCase(
            user_id=user.id,
            **payload.model_dump(),
        )
        session.add(immigration_case)
        await session.commit()
        await session.refresh(immigration_case)
        await self._audit_service.record_event(
            session,
            actor_user_id=user.id,
            event_type=AuditEventType.CASE_CREATED,
            target_entity_type=AuditTargetEntityType.IMMIGRATION_CASE,
            target_entity_id=immigration_case.id,
            metadata={
                "title": immigration_case.title,
                "target_country": immigration_case.target_country,
                "target_program": immigration_case.target_program,
                "status": immigration_case.status,
            },
        )
        return immigration_case

    async def list_cases(
        self,
        session: AsyncSession,
        user: User,
    ) -> list[ImmigrationCase]:
        result = await session.execute(
            select(ImmigrationCase)
            .where(ImmigrationCase.user_id == user.id)
            .order_by(ImmigrationCase.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_case(
        self,
        session: AsyncSession,
        user: User,
        case_id: UUID,
    ) -> ImmigrationCase:
        result = await session.execute(
            select(ImmigrationCase).where(
                ImmigrationCase.id == case_id,
                ImmigrationCase.user_id == user.id,
            )
        )
        immigration_case = result.scalar_one_or_none()

        if immigration_case is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Immigration case not found.",
            )

        return immigration_case

    async def update_case(
        self,
        session: AsyncSession,
        user: User,
        case_id: UUID,
        payload: ImmigrationCaseUpdate,
    ) -> ImmigrationCase:
        immigration_case = await self.get_case(session, user, case_id)
        updates = payload.model_dump(exclude_unset=True)

        if not updates:
            return immigration_case

        for field_name, value in updates.items():
            setattr(immigration_case, field_name, value)

        await session.commit()
        await session.refresh(immigration_case)
        await self._audit_service.record_event(
            session,
            actor_user_id=user.id,
            event_type=AuditEventType.CASE_UPDATED,
            target_entity_type=AuditTargetEntityType.IMMIGRATION_CASE,
            target_entity_id=immigration_case.id,
            metadata={"updated_fields": sorted(updates.keys())},
        )
        return immigration_case

    async def delete_case(
        self,
        session: AsyncSession,
        user: User,
        case_id: UUID,
    ) -> None:
        immigration_case = await self.get_case(session, user, case_id)
        await session.delete(immigration_case)
        await session.commit()
