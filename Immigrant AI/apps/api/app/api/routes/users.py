from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_admin_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.user import UserRead

router = APIRouter(tags=["users"])


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
