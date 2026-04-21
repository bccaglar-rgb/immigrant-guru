"""Redis-backed sliding-window rate limiting middleware.

Each rule defines:
  path_prefix  — matched against request path
  per_ip       — (max_requests, window_seconds) keyed by real client IP
  per_user     — (max_requests, window_seconds) keyed by verified JWT sub claim (optional)

IP extraction: trusts X-Forwarded-For only when TRUSTED_PROXY_IPS is configured.
Fail-closed: Redis failure blocks requests on sensitive paths instead of allowing all.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

_SKIP_PATHS = {"/", "/health", "/api/v1/health", "/api/v1/version"}

# Paths where rate-limit failure should block rather than allow (fail-closed).
_FAIL_CLOSED_PREFIXES = (
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/verify-reset-code",
    "/api/v1/auth/reset-password",
)


def _extract_ip(request: Request) -> str:
    """Return the real client IP.

    X-Forwarded-For is honoured only when the connection comes from a
    configured trusted proxy.  Without that configuration we use the
    direct socket address, which cannot be spoofed.
    """
    from app.core.config import get_settings
    settings = get_settings()
    trusted_proxies: set[str] = set(getattr(settings, "trusted_proxy_ips", None) or [])

    direct_ip = request.client.host if request.client else "unknown"

    if not trusted_proxies or direct_ip not in trusted_proxies:
        return direct_ip

    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        # Rightmost IP added by the trusted proxy is the real client.
        ips = [ip.strip() for ip in forwarded.split(",")]
        return ips[-1] if ips else direct_ip
    return direct_ip


def _extract_verified_user_id(request: Request) -> str | None:
    """Extract user ID only from a cryptographically verified JWT.

    Decoding without verification would let attackers rotate their
    per-user rate-limit bucket by forging arbitrary sub values.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth.removeprefix("Bearer ").strip()
    try:
        from app.core.security import decode_access_token
        payload = decode_access_token(token)
        sub = str(payload.get("sub", "")).strip()
        return sub or None
    except Exception:
        return None


async def _sliding_window_check(
    redis_client: Any,
    key: str,
    max_requests: int,
    window_seconds: int,
) -> bool:
    """Returns True if request is allowed, False if rate limited.

    Uses a sorted-set sliding window: score = timestamp in ms.
    """
    now_ms = int(time.time() * 1000)
    window_start_ms = now_ms - window_seconds * 1000

    pipe = redis_client.pipeline()
    pipe.zremrangebyscore(key, "-inf", window_start_ms)
    pipe.zadd(key, {str(now_ms): now_ms})
    pipe.zcard(key)
    pipe.expire(key, window_seconds + 1)
    results = await pipe.execute()

    count = results[2]
    return count <= max_requests


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, *, redis_url: str, rules: list[dict]) -> None:
        super().__init__(app)
        self._redis_url = redis_url
        self._rules = rules
        self._redis: Any = None

    async def _get_redis(self) -> Any:
        if self._redis is None:
            from redis.asyncio import from_url as redis_from_url
            self._redis = redis_from_url(
                self._redis_url,
                decode_responses=True,
                health_check_interval=30,
            )
        return self._redis

    def _match_rule(self, path: str) -> dict | None:
        for rule in self._rules:
            if path.startswith(rule["path_prefix"]):
                return rule
        return None

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path in _SKIP_PATHS or request.method == "OPTIONS":
            return await call_next(request)

        rule = self._match_rule(path)
        if rule is None:
            return await call_next(request)

        fail_closed = any(path.startswith(p) for p in _FAIL_CLOSED_PREFIXES)

        try:
            redis = await self._get_redis()

            ip = _extract_ip(request)

            # Per-IP check
            if rule.get("per_ip"):
                max_req, window = rule["per_ip"]
                key = f"rl:ip:{ip}:{rule['path_prefix']}"
                allowed = await _sliding_window_check(redis, key, max_req, window)
                if not allowed:
                    logger.warning("rate_limit.ip_blocked ip=%s path=%s", ip, path)
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Too many requests. Please slow down."},
                        headers={"Retry-After": str(window)},
                    )

            # Per-user check — only with a verified token, not raw JWT decode
            if rule.get("per_user"):
                user_id = _extract_verified_user_id(request)
                if user_id:
                    max_req, window = rule["per_user"]
                    key = f"rl:user:{user_id}:{rule['path_prefix']}"
                    allowed = await _sliding_window_check(redis, key, max_req, window)
                    if not allowed:
                        logger.warning("rate_limit.user_blocked user=%s path=%s", user_id, path)
                        return JSONResponse(
                            status_code=429,
                            content={"detail": "Too many requests. Please slow down."},
                            headers={"Retry-After": str(window)},
                        )

        except Exception:
            logger.exception("rate_limit.check_failed path=%s", path)
            if fail_closed:
                # Auth/reset endpoints fail-closed: deny rather than allow unlimited retries
                return JSONResponse(
                    status_code=503,
                    content={"detail": "Rate limiting temporarily unavailable. Please try again shortly."},
                )

        return await call_next(request)
