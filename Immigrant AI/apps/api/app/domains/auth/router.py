import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from redis.asyncio import from_url as redis_from_url
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import decode_access_token, get_current_user
from app.db.session import get_db_session
from app.domains.auth.email_verification import store_verification_code
from app.models.user import User
from app.schemas.auth import (
    AppleAuthRequest,
    AuthenticatedUserResponse,
    EmailCodeRequest,
    EmailCodeVerifyRequest,
    GoogleAuthRequest,
    LoginRequest,
    RegistrationInitiatedResponse,
    TokenResponse,
    UserRegistrationRequest,
)
from app.services.auth.auth_service import AuthService
from app.services.shared.email_service import send_verification_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
auth_service = AuthService()

_REVOKE_TTL = 60 * 60  # 1 hour — covers max token lifetime


async def _revoke_token(token: str) -> None:
    """Add token JTI/hash to Redis revocation list until it would expire."""
    settings = get_settings()
    try:
        payload = decode_access_token(token)
        jti = f"{payload.get('sub', '')}:{payload.get('iat', '')}"
        ttl = max(int(payload.get("exp", 0)) - int(__import__("time").time()), 1)
        redis = redis_from_url(settings.redis_url, decode_responses=True)
        await redis.setex(f"revoked_token:{jti}", min(ttl + 60, _REVOKE_TTL), "1")
        await redis.aclose()
    except Exception:
        logger.exception("auth.logout_revoke_failed")


@router.post(
    "/register",
    response_model=RegistrationInitiatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    payload: UserRegistrationRequest,
    session: AsyncSession = Depends(get_db_session),
) -> RegistrationInitiatedResponse:
    user = await auth_service.register_user(session, payload)

    # Send verification code (fail-open: registration still succeeds if email fails)
    try:
        from app.domains.auth.email_verification import store_verification_code
        from app.services.shared.email_service import send_verification_email
        code = await store_verification_code(user.email)
        await send_verification_email(user.email, code)
    except Exception:
        logger.exception("auth.register_verification_email_failed email=%s", user.email)

    return RegistrationInitiatedResponse()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in with email and password",
)
async def login(
    payload: LoginRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    return await auth_service.login(session, payload)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the current access token",
)
async def logout(request: Request, _: User = Depends(get_current_user)):
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
        await _revoke_token(token)
    return JSONResponse(status_code=status.HTTP_204_NO_CONTENT, content=None)


_LOGIN_CODE_PREFIX = "auth:login_code:"
_LOGIN_CODE_ATTEMPTS_PREFIX = "auth:login_code:attempts:"
_LOGIN_CODE_TTL_SECONDS = 600  # 10 minutes
_LOGIN_CODE_MAX_ATTEMPTS = 5


@router.post(
    "/email/code/request",
    status_code=status.HTTP_200_OK,
    summary="Send a 6-digit login/signup code to the email",
)
async def request_email_login_code(payload: EmailCodeRequest) -> dict:
    """Send a code that works for both new and existing users. Always
    returns 200 — never reveal whether the address exists."""
    email = payload.email.strip().lower()
    settings = get_settings()
    try:
        # Reuse the same Redis-backed code mechanism used for email
        # verification, but under a separate key prefix so login flows can't
        # consume verification codes (or vice-versa).
        code = await store_verification_code(email)  # generates + stores
        # Re-key under the login prefix so /verify only checks login codes.
        redis = redis_from_url(settings.redis_url, decode_responses=True)
        try:
            await redis.setex(f"{_LOGIN_CODE_PREFIX}{email}", _LOGIN_CODE_TTL_SECONDS, code)
            await redis.delete(f"{_LOGIN_CODE_ATTEMPTS_PREFIX}{email}")
        finally:
            await redis.aclose()
        await send_verification_email(email, code)
    except Exception:
        logger.exception("auth.login_code_send_failed email=%s", email)
        # Still return 200 so we don't leak whether sending the email succeeded.
    return {"sent": True}


@router.post(
    "/email/code/verify",
    response_model=TokenResponse,
    summary="Exchange a 6-digit code for an access token (creates account if new)",
)
async def verify_email_login_code(
    payload: EmailCodeVerifyRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    email = payload.email.strip().lower()
    settings = get_settings()

    redis = redis_from_url(settings.redis_url, decode_responses=True)
    try:
        stored = await redis.get(f"{_LOGIN_CODE_PREFIX}{email}")
        if stored is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Code not found or expired. Request a new one.",
            )

        attempts_key = f"{_LOGIN_CODE_ATTEMPTS_PREFIX}{email}"
        attempts = await redis.incr(attempts_key)
        await redis.expire(attempts_key, _LOGIN_CODE_TTL_SECONDS)

        if attempts > _LOGIN_CODE_MAX_ATTEMPTS:
            await redis.delete(f"{_LOGIN_CODE_PREFIX}{email}", attempts_key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Request a new code.",
            )

        if not hmac.compare_digest(payload.code.strip().encode(), stored.encode()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid code. Please try again.",
            )

        await redis.delete(f"{_LOGIN_CODE_PREFIX}{email}", attempts_key)
    finally:
        await redis.aclose()

    return await auth_service.login_with_email_code(session, email)


@router.post(
    "/google",
    response_model=TokenResponse,
    summary="Sign in with a Google ID token",
)
async def login_google(
    payload: GoogleAuthRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    return await auth_service.login_with_google(session, payload.id_token)


@router.post(
    "/apple",
    response_model=TokenResponse,
    summary="Sign in with an Apple identityToken",
)
async def login_apple(
    payload: AppleAuthRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    return await auth_service.login_with_apple(
        session,
        payload.id_token,
        first_name=payload.first_name,
        last_name=payload.last_name,
    )


@router.get(
    "/me",
    response_model=AuthenticatedUserResponse,
    summary="Get the authenticated user",
)
async def me(
    current_user: User = Depends(get_current_user),
) -> AuthenticatedUserResponse:
    return AuthenticatedUserResponse.model_validate(current_user)
