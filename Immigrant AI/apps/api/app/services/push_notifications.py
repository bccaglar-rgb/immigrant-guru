"""Expo push notifications helper — fire-and-forget.

Any server-side code can call ``send_push_to_user(user_id, title, body)`` to
notify every registered device.  Failures are logged but never raised: a
broken notification path should not take down the request that triggered it.

Expo HTTP push API:
    POST https://exp.host/--/api/v2/push/send
    body: [{to, title, body, data}, ...]
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Iterable
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_engine
from app.models.push_device_token import PushDeviceToken

logger = logging.getLogger(__name__)

_EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send"
_HTTP_TIMEOUT = 10


async def _tokens_for_user(session: AsyncSession, user_id: UUID) -> list[str]:
    rows = await session.execute(
        select(PushDeviceToken.token).where(PushDeviceToken.user_id == user_id)
    )
    return [r[0] for r in rows.all()]


def _messages(
    tokens: Iterable[str],
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for token in tokens:
        entry: dict[str, Any] = {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
        }
        if data:
            entry["data"] = data
        payload.append(entry)
    return payload


async def _post_batch(messages: list[dict[str, Any]]) -> None:
    if not messages:
        return
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            await client.post(
                _EXPO_ENDPOINT,
                json=messages,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
    except Exception:
        logger.exception("push_notifications.post_failed count=%d", len(messages))


async def send_push_to_user(
    user_id: UUID | str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> None:
    """Deliver a notification to every device the given user has registered."""
    uid = user_id if isinstance(user_id, UUID) else UUID(str(user_id))
    # Lazily materialise the session factory (side-effect of get_engine()).
    get_engine()
    from app.db import session as _session_mod
    if _session_mod.session_factory is None:
        logger.warning("push_notifications.no_session_factory")
        return
    async with _session_mod.session_factory() as session:
        tokens = await _tokens_for_user(session, uid)
    if not tokens:
        return
    await _post_batch(_messages(tokens, title=title, body=body, data=data))


def fire_and_forget_push(
    user_id: UUID | str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> None:
    """Schedule send_push_to_user on the running event loop (safe from sync code)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(send_push_to_user(user_id, title, body, data))
            return
    except RuntimeError:
        pass
    # no running loop — run once to completion (CLI / worker scripts)
    asyncio.run(send_push_to_user(user_id, title, body, data))
