from __future__ import annotations

import logging
from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("immigrant-ai-api.errors")


def _error_payload(
    *,
    request: Request,
    code: str,
    message: str,
    details: Any = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
        },
        "path": request.url.path,
        "request_id": getattr(request.state, "request_id", None),
    }

    if details is not None:
        payload["error"]["details"] = jsonable_encoder(details)

    return payload


def _response_headers(request: Request, extra_headers: dict[str, str] | None = None) -> dict[str, str]:
    headers: dict[str, str] = {}
    request_id = getattr(request.state, "request_id", None)
    if request_id:
        headers["X-Request-ID"] = request_id

    if extra_headers:
        headers.update(extra_headers)

    return headers


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_error_payload(
                request=request,
                code="validation_error",
                message="Request validation failed.",
                details=exc.errors(),
            ),
            headers=_response_headers(request),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload(
                request=request,
                code="http_error",
                message=str(exc.detail),
            ),
            headers=_response_headers(
                request,
                {
                    key: value
                    for key, value in (exc.headers or {}).items()
                    if isinstance(key, str) and isinstance(value, str)
                },
            ),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception("Unhandled exception on %s", request.url.path, exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=_error_payload(
                request=request,
                code="internal_server_error",
                message="Internal server error.",
            ),
            headers=_response_headers(request),
        )
