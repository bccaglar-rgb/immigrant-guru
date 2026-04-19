"""Redis-backed sliding-window rate limiting middleware.

Each rule defines:
  path_prefix  — matched against request path
  per_ip       — (max_requests, window_seconds) keyed by client IP
  per_user     — (max_requests, window_seconds) keyed by JWT sub claim (optional)
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


def _extract_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _extract_user_id(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth.removeprefix("Bearer ").strip()
    try:
        import base64, json as _json
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        # Pad base64
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = _json.loads(base64.urlsafe_b64decode(payload_b64))
        return str(payload.get("sub", "")) or None
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

            # Per-user check (only if rule defines it and user is authenticated)
            if rule.get("per_user"):
                user_id = _extract_user_id(request)
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
            # Rate limiter failure must never block legitimate requests
            logger.exception("rate_limit.check_failed path=%s", path)

        return await call_next(request)
