from __future__ import annotations

"""Runtime translation proxy.

Translates short UI strings on demand via MyMemory, caches results in Redis
so the same string is only translated once for the whole user base.
"""

import asyncio
import logging
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from redis.asyncio import from_url as redis_from_url

from app.core.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/i18n", tags=["i18n"])

SUPPORTED_LANGUAGES = {
    "en", "tr", "de", "fr", "es", "pt", "ar", "tl", "vi", "ht",
    "pa", "gu", "ur", "bn", "te", "ta", "fa", "zh", "ja", "ko",
    "ru", "hi",
}

MAX_BATCH_SIZE = 200
MAX_TEXT_LENGTH = 500
CACHE_TTL_SECONDS = 60 * 60 * 24 * 90  # 90 days


class TranslateRequest(BaseModel):
    target: str = Field(..., min_length=2, max_length=5)
    texts: list[str] = Field(..., min_length=1, max_length=MAX_BATCH_SIZE)


class TranslateResponse(BaseModel):
    target: str
    translations: dict[str, str]


async def _translate_via_mymemory(text: str, target: str) -> str | None:
    """Call MyMemory public translation API. Returns None on failure."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                "https://api.mymemory.translated.net/get",
                params={"q": text, "langpair": f"en|{target}"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            translated = (data.get("responseData") or {}).get("translatedText")
            if not translated or not isinstance(translated, str):
                return None
            # MyMemory returns error strings inside translatedText sometimes;
            # treat payloads that look like API warnings as failures.
            if translated.strip().upper().startswith("MYMEMORY WARNING"):
                return None
            return translated
    except (httpx.HTTPError, ValueError):
        return None


@router.post("/translate", response_model=TranslateResponse)
async def translate(body: TranslateRequest) -> TranslateResponse:
    target = body.target.lower()
    if target not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported target language: {target}",
        )

    # English is the source — no-op
    if target == "en":
        return TranslateResponse(target=target, translations={t: t for t in body.texts})

    # Dedupe + filter
    unique_texts: list[str] = []
    seen: set[str] = set()
    for raw in body.texts:
        text = (raw or "").strip()
        if not text or len(text) > MAX_TEXT_LENGTH:
            continue
        if text in seen:
            continue
        seen.add(text)
        unique_texts.append(text)

    if not unique_texts:
        return TranslateResponse(target=target, translations={})

    settings = get_settings()
    redis_client = None
    translations: dict[str, str] = {}
    cache_misses: list[str] = []

    try:
        redis_client = redis_from_url(
            settings.redis_url,
            decode_responses=True,
            health_check_interval=30,
        )
        keys = [f"i18n:{target}:{text}" for text in unique_texts]
        cached_values = await redis_client.mget(keys)
        for text, cached in zip(unique_texts, cached_values, strict=True):
            if cached is not None:
                translations[text] = cached
            else:
                cache_misses.append(text)
    except Exception:
        logger.exception("i18n.redis_cache_read_failed target=%s", target)
        cache_misses = list(unique_texts)

    # Fetch misses via MyMemory concurrently (bounded).
    if cache_misses:
        semaphore = asyncio.Semaphore(4)

        async def _fetch(text: str) -> tuple[str, str | None]:
            async with semaphore:
                result = await _translate_via_mymemory(text, target)
                return text, result

        results = await asyncio.gather(*(_fetch(t) for t in cache_misses))

        pipeline = None
        if redis_client is not None:
            try:
                pipeline = redis_client.pipeline()
            except Exception:
                pipeline = None

        for text, translated in results:
            if translated and translated.strip() and translated.strip() != text:
                translations[text] = translated
                if pipeline is not None:
                    pipeline.set(f"i18n:{target}:{text}", translated, ex=CACHE_TTL_SECONDS)

        if pipeline is not None:
            try:
                await pipeline.execute()
            except Exception:
                logger.exception("i18n.redis_cache_write_failed target=%s", target)

    if redis_client is not None:
        try:
            await redis_client.aclose()
        except Exception:
            pass

    return TranslateResponse(target=target, translations=translations)
