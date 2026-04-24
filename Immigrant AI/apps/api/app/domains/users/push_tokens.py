"""Push notification token registration for the mobile app.

Mobile clients call these on app launch (after sign-in) and on logout:

    POST   /users/push-token   {token, platform, locale?, appVersion?}
    DELETE /users/push-token   {token}

The worker reads from push_device_tokens to fan out notifications
(analysis ready, plan renewal, onboarding reminder, etc.).
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db_session
from app.models.push_device_token import PushDeviceToken
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


class RegisterPushTokenRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512)
    platform: Literal["ios", "android", "web"]
    locale: str | None = Field(default=None, max_length=16)
    app_version: str | None = Field(default=None, max_length=32, alias="appVersion")

    model_config = {"populate_by_name": True}


class DeregisterPushTokenRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512)


@router.post(
    "/push-token",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Register or update a push notification token for the current user",
)
async def register_push_token(
    payload: RegisterPushTokenRequest,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    """Upsert the token → user_id mapping.

    Apple/Google rotate tokens and a device might change users (account
    switch).  We therefore reassign the token row to *current_user* on every
    call rather than inserting new rows.
    """
    existing = await session.execute(
        select(PushDeviceToken).where(PushDeviceToken.token == payload.token)
    )
    row = existing.scalar_one_or_none()

    if row is None:
        row = PushDeviceToken(
            user_id=current_user.id,
            token=payload.token,
            platform=payload.platform,
            locale=payload.locale,
            app_version=payload.app_version,
        )
        session.add(row)
    else:
        row.user_id = current_user.id
        row.platform = payload.platform
        if payload.locale is not None:
            row.locale = payload.locale
        if payload.app_version is not None:
            row.app_version = payload.app_version

    await session.commit()
    logger.info(
        "push_token.registered user=%s platform=%s",
        current_user.id,
        payload.platform,
    )


@router.delete(
    "/push-token",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deregister a push notification token (on logout)",
)
async def deregister_push_token(
    payload: DeregisterPushTokenRequest,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    await session.execute(
        delete(PushDeviceToken).where(
            PushDeviceToken.token == payload.token,
            PushDeviceToken.user_id == current_user.id,
        )
    )
    await session.commit()
    logger.info("push_token.deregistered user=%s", current_user.id)
