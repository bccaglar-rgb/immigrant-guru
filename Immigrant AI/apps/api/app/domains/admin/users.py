from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_admin_user
from app.db.session import get_db_session
from app.models.enums import UserStatus
from app.models.user import User
from app.schemas.user import UserRead

router = APIRouter(tags=["users"])


class AdminStats(BaseModel):
    total_users: int
    active_users: int
    suspended_users: int
    verified_users: int
    unverified_users: int
    by_plan: dict[str, int]
    registered_today: int
    registered_this_week: int


class AdminUserUpdate(BaseModel):
    plan: str | None = None
    status: UserStatus | None = None


@router.get("/users", response_model=list[UserRead], summary="List users")
async def list_users(
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[UserRead]:
    result = await session.execute(
        select(User)
        .options(
            selectinload(User.profile),
            selectinload(User.immigration_cases),
        )
        .order_by(User.created_at.desc())
    )
    users = result.scalars().unique().all()
    return [UserRead.model_validate(user) for user in users]


@router.get("/admin/stats", response_model=AdminStats, summary="Platform statistics")
async def get_admin_stats(
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
) -> AdminStats:
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)

    total_res = await session.execute(select(func.count(User.id)))
    total = total_res.scalar_one() or 0

    active_res = await session.execute(
        select(func.count(User.id)).where(User.status == UserStatus.ACTIVE)
    )
    active = active_res.scalar_one() or 0

    suspended_res = await session.execute(
        select(func.count(User.id)).where(User.status == UserStatus.SUSPENDED)
    )
    suspended = suspended_res.scalar_one() or 0

    verified_res = await session.execute(
        select(func.count(User.id)).where(User.email_verified.is_(True))
    )
    verified = verified_res.scalar_one() or 0

    plan_res = await session.execute(
        select(User.plan, func.count(User.id)).group_by(User.plan)
    )
    by_plan = {row[0]: row[1] for row in plan_res.all()}

    today_res = await session.execute(
        select(func.count(User.id)).where(User.created_at >= today)
    )
    registered_today = today_res.scalar_one() or 0

    week_res = await session.execute(
        select(func.count(User.id)).where(User.created_at >= week_ago)
    )
    registered_this_week = week_res.scalar_one() or 0

    return AdminStats(
        total_users=total,
        active_users=active,
        suspended_users=suspended,
        verified_users=verified,
        unverified_users=total - verified,
        by_plan=by_plan,
        registered_today=registered_today,
        registered_this_week=registered_this_week,
    )


@router.patch("/admin/users/{user_id}", response_model=UserRead, summary="Update user plan or status")
async def update_user(
    user_id: UUID,
    payload: AdminUserUpdate,
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserRead:
    result = await session.execute(
        select(User)
        .options(selectinload(User.profile), selectinload(User.immigration_cases))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if payload.plan is not None:
        user.plan = payload.plan
    if payload.status is not None:
        user.status = payload.status

    await session.commit()
    await session.refresh(user)
    return UserRead.model_validate(user)
