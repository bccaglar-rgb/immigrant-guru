from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.enums import AuditEventType, AuditTargetEntityType, UserStatus
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.auth import LoginRequest, TokenResponse, UserRegistrationRequest
from app.services.shared.audit_service import AuditService

logger = logging.getLogger(__name__)


class AuthService:
    """Authentication workflows for local credential-based auth."""

    def __init__(self, *, audit_service: AuditService | None = None) -> None:
        self._audit_service = audit_service or AuditService()

    async def register_user(
        self,
        session: AsyncSession,
        payload: UserRegistrationRequest,
    ) -> User:
        normalized_email = payload.email.strip().lower()

        existing_user = await self._get_user_by_email(session, normalized_email)
        if existing_user is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )

        user = User(
            email=normalized_email,
            password_hash=get_password_hash(payload.password),
            status=UserStatus.ACTIVE,
        )

        user.profile = UserProfile(**payload.profile.model_dump()) if payload.profile is not None else UserProfile()

        session.add(user)

        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            ) from exc

        created_user = await self._get_user_by_id(session, user.id)
        if created_user is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="User registration could not be completed.",
            )

        await self._audit_service.record_event(
            session,
            actor_user_id=created_user.id,
            event_type=AuditEventType.USER_REGISTERED,
            target_entity_type=AuditTargetEntityType.USER,
            target_entity_id=created_user.id,
            metadata={"email": created_user.email},
        )

        return created_user

    async def login(
        self,
        session: AsyncSession,
        payload: LoginRequest,
    ) -> TokenResponse:
        normalized_email = payload.email.strip().lower()
        user = await self._get_user_by_email(session, normalized_email)

        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if user.status != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is not active.",
            )

        if not user.email_verified:
            # Resend code so the user can complete verification immediately
            try:
                from app.domains.auth.email_verification import store_verification_code
                from app.services.shared.email_service import send_verification_email
                code = await store_verification_code(user.email)
                await send_verification_email(user.email, code)
            except Exception:
                logger.exception("auth.login_resend_verification_failed email=%s", user.email)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email not verified. We've resent the verification code — check your inbox.",
                headers={"X-Requires-Verification": "true"},
            )

        access_token, expires_in = create_access_token(user.id, token_version=user.token_version or 0)
        await self._audit_service.record_event(
            session,
            actor_user_id=user.id,
            event_type=AuditEventType.USER_LOGGED_IN,
            target_entity_type=AuditTargetEntityType.USER,
            target_entity_id=user.id,
            metadata={"email": user.email},
        )
        return TokenResponse(access_token=access_token, expires_in=expires_in)

    async def _get_user_by_email(
        self,
        session: AsyncSession,
        email: str,
    ) -> User | None:
        result = await session.execute(
            select(User)
            .options(selectinload(User.profile))
            .where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def _get_user_by_id(
        self,
        session: AsyncSession,
        user_id: UUID,
    ) -> User | None:
        result = await session.execute(
            select(User)
            .options(selectinload(User.profile))
            .where(User.id == user_id)
        )
        return result.scalar_one_or_none()
