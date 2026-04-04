from __future__ import annotations

import logging

from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI

from app.core.config import Settings
from app.schemas.ai import AIStrategyModelOutput
from app.services.ai_client import (
    AIClientConfigurationError,
    AIClientResponseError,
    AIClientResult,
)

logger = logging.getLogger("immigrant-ai-api.openai_provider")


class OpenAIStrategyClient:
    """OpenAI-backed strategy generator using structured outputs."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: AsyncOpenAI | None = None

    async def generate_strategy(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> AIClientResult:
        model = self._resolve_model()
        client = self._get_client()

        try:
            response = await client.chat.completions.parse(
                model=model,
                temperature=self._settings.ai_temperature,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format=AIStrategyModelOutput,
            )
        except APITimeoutError as exc:
            logger.warning("ai.openai_timeout", exc_info=exc)
            raise AIClientResponseError("OpenAI request timed out.") from exc
        except APIConnectionError as exc:
            logger.warning("ai.openai_connection_error", exc_info=exc)
            raise AIClientResponseError("OpenAI connection failed.") from exc
        except APIStatusError as exc:
            logger.warning(
                "ai.openai_status_error",
                extra={"status_code": exc.status_code, "request_id": exc.request_id},
                exc_info=exc,
            )
            raise AIClientResponseError(
                f"OpenAI returned HTTP {exc.status_code}."
            ) from exc
        except Exception as exc:  # pragma: no cover - SDK boundary
            logger.exception("ai.openai_unexpected_error", exc_info=exc)
            raise AIClientResponseError("OpenAI request failed unexpectedly.") from exc

        choice = response.choices[0]
        parsed = choice.message.parsed
        refusal = getattr(choice.message, "refusal", None)

        if refusal:
            raise AIClientResponseError("OpenAI refused to produce a strategy response.")

        if parsed is None:
            raise AIClientResponseError("OpenAI returned an empty strategy payload.")

        return AIClientResult(
            output=parsed,
            model=model,
            provider="openai",
            request_id=getattr(response, "_request_id", None),
        )

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=self._resolve_api_key(),
                base_url=self._resolve_base_url(),
                max_retries=self._settings.openai_max_retries,
                timeout=self._settings.openai_timeout_seconds,
            )

        return self._client

    def _resolve_api_key(self) -> str:
        configured_key = (
            self._settings.openai_api_key or self._settings.ai_api_key
        )
        api_key = configured_key.get_secret_value() if configured_key is not None else ""

        if not api_key:
            raise AIClientConfigurationError("OpenAI API key is not configured.")

        return api_key

    def _resolve_model(self) -> str:
        model = (self._settings.openai_model or self._settings.ai_model).strip()

        if not model:
            raise AIClientConfigurationError("OpenAI model is not configured.")

        return model

    def _resolve_base_url(self) -> str | None:
        base_url = (self._settings.openai_base_url or self._settings.ai_base_url).strip()
        return base_url or None
