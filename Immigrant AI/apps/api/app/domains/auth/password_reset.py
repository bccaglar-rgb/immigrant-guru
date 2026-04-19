"""Password reset endpoints — email code verification."""

import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.db.session import get_db_session
from app.models.user import User
from app.services.shared.email_service import send_password_reset_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory code store (production: use Redis)
_reset_codes: dict[str, dict] = {}


def _generate_code() -> str:
    return str(secrets.randbelow(900000) + 100000)  # 6-digit code


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

    # Always return success (don't reveal if email exists)
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user:
        code = _generate_code()
        _reset_codes[email] = {
            "code": code,
            "created_at": datetime.now(timezone.utc),
            "attempts": 0,
        }

        await send_password_reset_email(email, code)
        logger.info("password_reset.code_sent email=%s", email)

    return {"message": "If an account exists with this email, a reset code has been sent."}


@router.post("/verify-reset-code")
async def verify_reset_code(body: VerifyCodeRequest):
    """Verify the 6-digit reset code."""
    email = body.email.strip().lower()
    stored = _reset_codes.get(email)

    if not stored:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No reset code found. Request a new one.")

    # Check attempts
    if stored["attempts"] >= 5:
        del _reset_codes[email]
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts. Request a new code.")

    # Check expiry (15 minutes)
    age = (datetime.now(timezone.utc) - stored["created_at"]).total_seconds()
    if age > 900:
        del _reset_codes[email]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code expired. Request a new one.")

    stored["attempts"] += 1

    if body.code != stored["code"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code. Please try again.")

    return {"verified": True}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Reset password with verified code."""
    email = body.email.strip().lower()
    stored = _reset_codes.get(email)

    if not stored or body.code != stored["code"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code.")

    # Check expiry
    age = (datetime.now(timezone.utc) - stored["created_at"]).total_seconds()
    if age > 900:
        del _reset_codes[email]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code expired.")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters.")

    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not found.")

    user.password_hash = get_password_hash(body.new_password)
    await session.commit()

    del _reset_codes[email]
    logger.info("password_reset.completed email=%s", email)

    return {"message": "Password reset successfully. You can now sign in."}
