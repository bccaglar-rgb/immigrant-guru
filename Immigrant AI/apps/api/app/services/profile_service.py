from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.user_profile import UserProfileUpdate


class ProfileService:
    """Manage authenticated users' immigration profiles."""

    async def get_or_create_profile(
        self,
        session: AsyncSession,
        user: User,
    ) -> UserProfile:
        if user.profile is not None:
            return user.profile

        profile = UserProfile(user_id=user.id)
        session.add(profile)
        await session.commit()
        await session.refresh(profile)
        user.profile = profile
        return profile

    async def update_profile(
        self,
        session: AsyncSession,
        user: User,
        payload: UserProfileUpdate,
    ) -> UserProfile:
        profile = await self.get_or_create_profile(session, user)
        updates = payload.model_dump(exclude_unset=True)

        if not updates:
            return profile

        for field_name, value in updates.items():
            if not hasattr(profile, field_name):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported profile field: {field_name}",
                )
            setattr(profile, field_name, value)

        await session.commit()
        await session.refresh(profile)
        user.profile = profile
        return profile
