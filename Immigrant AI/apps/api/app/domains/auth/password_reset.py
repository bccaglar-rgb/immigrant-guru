"""Password reset endpoints — email code verification backed by Redis."""

import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from redis.asyncio import from_url as redis_from_url
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.db.session import get_db_session
from app.models.user import User
from app.services.shared.email_service import send_password_reset_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_CODE_TTL_SECONDS = 900       # 15 minutes
_MAX_ATTEMPTS = 5
_CODE_PREFIX = "pwd_reset:code:"
_ATTEMPTS_PREFIX = "pwd_reset:attempts:"


def _generate_code() -> str:
    return str(secrets.randbelow(900000) + 100000)  # 6-digit code


async def _get_redis():
    settings = get_settings()
    return redis_from_url(settings.redis_url, decode_responses=True, health_check_interval=30)


async def _store_code(email: str, code: str) -> None:
    redis = await _get_redis()
    try:
        await redis.setex(f"{_CODE_PREFIX}{email}", _CODE_TTL_SECONDS, code)
        await redis.delete(f"{_ATTEMPTS_PREFIX}{email}")
    finally:
        await redis.aclose()


async def _get_code(email: str) -> str | None:
    redis = await _get_redis()
    try:
        return await redis.get(f"{_CODE_PREFIX}{email}")
    finally:
        await redis.aclose()


async def _increment_attempts(email: str) -> int:
    redis = await _get_redis()
    try:
        key = f"{_ATTEMPTS_PREFIX}{email}"
        count = await redis.incr(key)
        # align expiry with the code itself
        await redis.expire(key, _CODE_TTL_SECONDS)
        return count
    finally:
        await redis.aclose()


async def _delete_code(email: str) -> None:
    redis = await _get_redis()
    try:
        await redis.delete(f"{_CODE_PREFIX}{email}", f"{_ATTEMPTS_PREFIX}{email}")
    finally:
        await redis.aclose()


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Send a 6-digit reset code to the user's email."""
    email = body.email.strip().lower()

    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user:
        code = _generate_code()
        try:
            await _store_code(email, code)
        except Exception:
            logger.exception("password_reset.redis_store_failed email=%s", email)
            # Continue — code generation succeeded; inform user gracefully
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Password reset is temporarily unavailable. Please try again shortly.",
            )

        result_email = await send_password_reset_email(email, code)
        if result_email is None:
            logger.error("password_reset.email_failed email=%s", email)
        else:
            logger.info("password_reset.code_sent email=%s", email)

    # Always return success — don't reveal if email exists
    return {"message": "If an account exists with this email, a reset code has been sent."}


@router.post("/verify-reset-code")
async def verify_reset_code(body: VerifyCodeRequest):
    """Verify the 6-digit reset code."""
    email = body.email.strip().lower()

    try:
        stored_code = await _get_code(email)
    except Exception:
        logger.exception("password_reset.redis_get_failed email=%s", email)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Service temporarily unavailable.")

    if not stored_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No reset code found. Request a new one.")

    try:
        attempts = await _increment_attempts(email)
    except Exception:
        logger.exception("password_reset.redis_attempts_failed email=%s", email)
        attempts = 0

    if attempts > _MAX_ATTEMPTS:
        await _delete_code(email)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts. Request a new code.")

    if body.code != stored_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code. Please try again.")

    return {"verified": True}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Reset password with verified code."""
    email = body.email.strip().lower()

    try:
        stored_code = await _get_code(email)
    except Exception:
        logger.exception("password_reset.redis_get_failed email=%s", email)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Service temporarily unavailable.")

    if not stored_code or body.code != stored_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code.")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters.")

    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not found.")

    user.password_hash = get_password_hash(body.new_password)
    await session.commit()

    try:
        await _delete_code(email)
    except Exception:
        logger.warning("password_reset.redis_cleanup_failed email=%s", email)

    logger.info("password_reset.completed email=%s", email)
    return {"message": "Password reset successfully. You can now sign in."}
