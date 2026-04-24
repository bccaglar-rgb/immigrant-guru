"""CaglarAnalytics — fire-and-forget event reporting for the API.

All calls are best-effort (fail-open): network errors or missing API key
never raise to the caller.  Use the module-level helpers:

    from app.services.analytics import ca_event, ca_payment, ca_error

They dispatch in a daemon thread so they never block request handling.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BASE = "https://admin.caglarlabs.com/api/v1"
_TIMEOUT = 5  # seconds


def _api_key() -> str | None:
    return os.environ.get("CAGLAR_ANALYTICS_KEY")


def _post(path: str, payload: dict[str, Any]) -> None:
    """Send a single POST in the current thread (called from a daemon thread)."""
    key = _api_key()
    if not key:
        return
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            client.post(
                f"{_BASE}/{path}",
                json=payload,
                headers={"X-API-Key": key, "Content-Type": "application/json"},
            )
    except Exception:
        logger.debug("caglar_analytics.post_failed path=%s", path, exc_info=True)


def _fire(path: str, payload: dict[str, Any]) -> None:
    """Dispatch *payload* to *path* asynchronously (daemon thread, fail-open)."""
    t = threading.Thread(target=_post, args=(path, payload), daemon=True)
    t.start()


# ── Public helpers ─────────────────────────────────────────────────────────────


def ca_event(
    event: str,
    user_id: str | None = None,
    properties: dict[str, Any] | None = None,
) -> None:
    """Track a named event (signup_completed, login, logout, …)."""
    _fire("ingest/event", {
        "event": event,
        "userId": user_id,
        "properties": properties or {},
        "source": "api",
    })


def ca_payment(
    user_id: str,
    plan: str,
    amount: float,
    currency: str = "USD",
    status: str = "success",
) -> None:
    """Track a payment / plan upgrade."""
    _fire("ingest/payment", {
        "userId": user_id,
        "plan": plan,
        "amount": amount,
        "currency": currency,
        "status": status,
        "source": "api",
    })


def ca_error(
    error: str,
    context: dict[str, Any] | None = None,
    user_id: str | None = None,
) -> None:
    """Report a server-side error."""
    _fire("ingest/error", {
        "error": error,
        "context": context or {},
        "userId": user_id,
        "source": "api",
    })
