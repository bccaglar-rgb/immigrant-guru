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
from app.services.auth.oauth_verifier import verify_apple_id_token, verify_google_id_token
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

        if (
            user is None
            or user.password_hash is None
            or not verify_password(payload.password, user.password_hash)
        ):
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

    async def login_with_email_code(
        self,
        session: AsyncSession,
        email: str,
    ) -> TokenResponse:
        """Issue a JWT for the verified email-code holder. Creates the
        user (with verified status) on first sign-in. The 6-digit code itself
        is validated upstream in the email-code router."""
        normalized_email = email.strip().lower()
        user = await self._get_user_by_email(session, normalized_email)

        if user is None:
            user = User(
                email=normalized_email,
                password_hash=None,
                status=UserStatus.ACTIVE,
                email_verified=True,
            )
            user.profile = UserProfile()
            session.add(user)
            try:
                await session.commit()
            except IntegrityError as exc:
                await session.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Could not create account.",
                ) from exc
            user = await self._get_user_by_id(session, user.id)
            if user is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Account creation failed.",
                )
            event = AuditEventType.USER_REGISTERED
        else:
            if user.status != UserStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User account is not active.",
                )
            if not user.email_verified:
                user.email_verified = True
                await session.commit()
            event = AuditEventType.USER_LOGGED_IN

        await self._audit_service.record_event(
            session,
            actor_user_id=user.id,
            event_type=event,
            target_entity_type=AuditTargetEntityType.USER,
            target_entity_id=user.id,
            metadata={"email": user.email, "method": "email_code"},
        )
        access_token, expires_in = create_access_token(user.id, token_version=user.token_version or 0)
        return TokenResponse(access_token=access_token, expires_in=expires_in)

    async def login_with_google(
        self,
        session: AsyncSession,
        id_token: str,
    ) -> TokenResponse:
        try:
            payload = verify_google_id_token(id_token)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(exc),
            ) from exc

        sub = str(payload["sub"])
        email = str(payload["email"]).strip().lower()
        first_name = payload.get("given_name") or None
        last_name = payload.get("family_name") or None

        return await self._login_or_link_oauth(
            session,
            provider="google",
            sub=sub,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )

    async def login_with_apple(
        self,
        session: AsyncSession,
        id_token: str,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> TokenResponse:
        try:
            payload = verify_apple_id_token(id_token)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(exc),
            ) from exc

        sub = str(payload["sub"])
        # Apple may relay a unique private email; required, not always verified
        email_claim = payload.get("email")
        if not email_claim:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="apple_email_required",
            )
        email = str(email_claim).strip().lower()

        return await self._login_or_link_oauth(
            session,
            provider="apple",
            sub=sub,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )

    async def _login_or_link_oauth(
        self,
        session: AsyncSession,
        *,
        provider: str,  # "google" | "apple"
        sub: str,
        email: str,
        first_name: str | None,
        last_name: str | None,
    ) -> TokenResponse:
        sub_field = f"{provider}_sub"

        # 1) Try to find an existing user already linked to this provider sub.
        result = await session.execute(
            select(User)
            .options(selectinload(User.profile))
            .where(getattr(User, sub_field) == sub)
        )
        user = result.scalar_one_or_none()

        # 2) Otherwise, find by email and link the provider to the existing
        #    account so the two paths converge (no duplicate users).
        if user is None:
            user = await self._get_user_by_email(session, email)
            if user is not None:
                setattr(user, sub_field, sub)
                if not user.email_verified:
                    user.email_verified = True

        # 3) Otherwise, create a brand-new user.
        created = False
        if user is None:
            user = User(
                email=email,
                password_hash=None,
                status=UserStatus.ACTIVE,
                email_verified=True,
            )
            setattr(user, sub_field, sub)
            user.profile = UserProfile(first_name=first_name, last_name=last_name)
            session.add(user)
            created = True

        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Account is linked to a different identity.",
            ) from exc

        user = await self._get_user_by_id(session, user.id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Sign-in failed.",
            )

        if user.status != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is not active.",
            )

        await self._audit_service.record_event(
            session,
            actor_user_id=user.id,
            event_type=AuditEventType.USER_REGISTERED if created else AuditEventType.USER_LOGGED_IN,
            target_entity_type=AuditTargetEntityType.USER,
            target_entity_id=user.id,
            metadata={"email": user.email, "method": provider},
        )
        access_token, expires_in = create_access_token(user.id, token_version=user.token_version or 0)
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
