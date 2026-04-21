from contextlib import asynccontextmanager
import logging
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse

from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.rate_limit import RateLimitMiddleware
from app.db.session import dispose_engine

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Cache-Control": "no-store",
}

settings = get_settings()
configure_logging(settings.log_level, settings.app_slug, settings.app_env)
logger = logging.getLogger(settings.app_slug)

# Request body size limit: 10 MB for regular endpoints; document upload is handled separately
_MAX_BODY_BYTES = 10 * 1024 * 1024


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("application.startup")
    yield
    await dispose_engine()
    logger.info("application.shutdown")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
)

if settings.cors_origins:
    # Wildcard + allow_credentials is forbidden by CORS spec and a security risk.
    if "*" in settings.cors_origins and settings.cors_allow_credentials:
        raise RuntimeError(
            "CORS misconfiguration: cannot combine allow_credentials=true with wildcard origin '*'."
        )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )

# Rate limiting middleware (Redis-backed sliding window)
app.add_middleware(
    RateLimitMiddleware,
    redis_url=settings.redis_url,
    rules=[
        # Auth endpoints — tight limits to prevent brute force
        {"path_prefix": "/api/v1/auth/login",           "per_ip": (10, 60),   "per_user": None},
        {"path_prefix": "/api/v1/auth/register",         "per_ip": (5, 60),    "per_user": None},
        {"path_prefix": "/api/v1/auth/forgot-password",   "per_ip": (5, 300),   "per_user": None},
        {"path_prefix": "/api/v1/auth/verify-reset-code", "per_ip": (10, 300),  "per_user": None},
        {"path_prefix": "/api/v1/auth/reset-password",    "per_ip": (5, 300),   "per_user": None},
        {"path_prefix": "/api/v1/auth/send-verification", "per_ip": (5, 300),   "per_user": None},
        {"path_prefix": "/api/v1/auth/verify-email",      "per_ip": (10, 300),  "per_user": None},
        # Billing — prevent session spam
        {"path_prefix": "/api/v1/billing/checkout",      "per_ip": (10, 3600), "per_user": (10, 3600)},
        # Stripe webhook — per-IP DoS guard. Limits are generous enough for legit Stripe bursts.
        {"path_prefix": "/api/v1/billing/webhook",        "per_ip": (300, 60),  "per_user": None},
        # AI endpoints — cost-sensitive
        {"path_prefix": "/api/v1/ai/",                   "per_ip": (60, 3600), "per_user": (60, 3600)},
        # Documents
        {"path_prefix": "/api/v1/documents/",            "per_ip": (100, 3600),"per_user": (100, 3600)},
        # Global catch-all
        {"path_prefix": "/api/v1/",                      "per_ip": (300, 60),  "per_user": None},
    ],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    for header, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    return response


@app.middleware("http")
async def enforce_body_size(request: Request, call_next) -> Response:
    """Reject oversized request bodies early (except document uploads)."""
    content_length = request.headers.get("content-length")
    is_upload = request.url.path.startswith("/api/v1/documents/") and request.method in ("POST", "PUT")

    if not is_upload and content_length and int(content_length) > _MAX_BODY_BYTES:
        return JSONResponse(
            status_code=413,
            content={"detail": "Request body too large."},
        )
    return await call_next(request)


@app.middleware("http")
async def add_request_context(request: Request, call_next) -> Response:
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    request.state.request_id = request_id
    started_at = perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((perf_counter() - started_at) * 1000, 2)
        logger.exception(
            "request.failed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "duration_ms": duration_ms,
            },
        )
        raise

    duration_ms = round((perf_counter() - started_at) * 1000, 2)
    response.headers["X-Request-ID"] = request_id

    logger.info(
        "request.completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


register_exception_handlers(app)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["meta"])
async def root() -> JSONResponse:
    return JSONResponse(
        content={
            "name": settings.app_name,
            "environment": settings.app_env,
            "health_url": f"{settings.api_v1_prefix}/health",
            "version_url": f"{settings.api_v1_prefix}/version",
        }
    )
