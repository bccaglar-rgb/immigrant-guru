from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.user_profile import UserProfileRead, UserProfileUpdate
from app.services.profile.profile_service import ProfileService

router = APIRouter(prefix="/profile", tags=["profile"])
profile_service = ProfileService()


@router.get("/me", response_model=UserProfileRead, summary="Get the authenticated user's immigration profile")
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserProfileRead:
    profile = await profile_service.get_or_create_profile(session, current_user)
    return UserProfileRead.model_validate(profile)


@router.put("/me", response_model=UserProfileRead, summary="Update the authenticated user's immigration profile")
async def update_my_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserProfileRead:
    profile = await profile_service.update_profile(session, current_user, payload)
    return UserProfileRead.model_validate(profile)
