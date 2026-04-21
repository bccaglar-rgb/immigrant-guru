"""Email verification for newly registered accounts — Redis-backed 6-digit code."""

from __future__ import annotations

import hmac
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from redis.asyncio import from_url as redis_from_url
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import TokenResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_CODE_TTL_SECONDS = 900  # 15 minutes
_MAX_ATTEMPTS = 5
_CODE_PREFIX = "email_verify:code:"
_ATTEMPTS_PREFIX = "email_verify:attempts:"


def _generate_code() -> str:
    return str(secrets.randbelow(1_000_000)).zfill(6)


def _codes_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


async def _get_redis():
    settings = get_settings()
    return redis_from_url(settings.redis_url, decode_responses=True, health_check_interval=30)


async def store_verification_code(email: str) -> str:
    """Generate and store a 6-digit code for the given email. Returns the code."""
    code = _generate_code()
    redis = await _get_redis()
    try:
        await redis.setex(f"{_CODE_PREFIX}{email}", _CODE_TTL_SECONDS, code)
        await redis.delete(f"{_ATTEMPTS_PREFIX}{email}")
    finally:
        await redis.aclose()
    return code


class SendVerificationRequest(BaseModel):
    email: EmailStr


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str


@router.post("/send-verification", status_code=status.HTTP_200_OK)
async def send_verification(
    body: SendVerificationRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """(Re)send email verification code. Safe to call multiple times."""
    email = body.email.strip().lower()
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user and not user.email_verified:
        try:
            code = await store_verification_code(email)
        except Exception:
            logger.exception("email_verify.redis_store_failed email=%s", email)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Verification service temporarily unavailable.",
            )
        try:
            from app.services.shared.email_service import send_verification_email
            await send_verification_email(email, code)
        except Exception:
            logger.exception("email_verify.send_failed email=%s", email)

    # Always 200 — don't reveal whether email exists
    return {"sent": True}


@router.post("/verify-email", response_model=TokenResponse)
async def verify_email(
    body: VerifyEmailRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Verify email with 6-digit code. On success, issues an access token."""
    email = body.email.strip().lower()

    try:
        redis = await _get_redis()
        stored_code = await redis.get(f"{_CODE_PREFIX}{email}")
        await redis.aclose()
    except Exception:
        logger.exception("email_verify.redis_get_failed email=%s", email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification service temporarily unavailable.",
        )

    if not stored_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code not found or expired. Request a new one.",
        )

    try:
        redis = await _get_redis()
        attempts_key = f"{_ATTEMPTS_PREFIX}{email}"
        attempts = await redis.incr(attempts_key)
        await redis.expire(attempts_key, _CODE_TTL_SECONDS)
        await redis.aclose()
    except Exception:
        logger.exception("email_verify.redis_attempts_failed email=%s", email)
        attempts = 0

    if attempts > _MAX_ATTEMPTS:
        try:
            redis = await _get_redis()
            await redis.delete(f"{_CODE_PREFIX}{email}", f"{_ATTEMPTS_PREFIX}{email}")
            await redis.aclose()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Request a new verification code.",
        )

    if not _codes_equal(body.code.strip(), stored_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid code. Please try again.",
        )

    result = await session.execute(
        select(User).options(selectinload(User.profile)).where(User.email == email)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account not found.",
        )

    # Snapshot fields we need for the welcome email BEFORE commit — post-commit
    # the user object is expired and lazy-loads would require an active
    # greenlet context (which we lose during async-io to Resend).
    welcome_email_address = user.email
    welcome_first_name = user.profile.first_name if user.profile else None

    user.email_verified = True
    await session.commit()

    try:
        redis = await _get_redis()
        await redis.delete(f"{_CODE_PREFIX}{email}", f"{_ATTEMPTS_PREFIX}{email}")
        await redis.aclose()
    except Exception:
        logger.warning("email_verify.redis_cleanup_failed email=%s", email)

    logger.info("email_verify.completed email=%s", email)

    try:
        from app.services.shared.email_service import send_welcome_email
        await send_welcome_email(welcome_email_address, welcome_first_name)
    except Exception:
        logger.exception("email_verify.welcome_email_failed email=%s", email)

    access_token, expires_in = create_access_token(user.id, token_version=user.token_version or 0)
    return TokenResponse(access_token=access_token, expires_in=expires_in)
