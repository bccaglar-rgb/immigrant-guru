import logging

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from redis.asyncio import from_url as redis_from_url
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import decode_access_token, get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import (
    AuthenticatedUserResponse,
    LoginRequest,
    RegistrationInitiatedResponse,
    TokenResponse,
    UserRegistrationRequest,
)
from app.services.auth.auth_service import AuthService

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

    from app.services.analytics import ca_event
    ca_event("signup_started", properties={"email": payload.email})
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
    token_response = await auth_service.login(session, payload)
    from app.services.analytics import ca_event
    ca_event("login", properties={"email": payload.email})
    return token_response


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


@router.get(
    "/me",
    response_model=AuthenticatedUserResponse,
    summary="Get the authenticated user",
)
async def me(
    current_user: User = Depends(get_current_user),
) -> AuthenticatedUserResponse:
    return AuthenticatedUserResponse.model_validate(current_user)
