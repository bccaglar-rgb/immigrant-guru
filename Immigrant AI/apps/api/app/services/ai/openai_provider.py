from __future__ import annotations

import logging

from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI

from app.core.config import Settings
from app.schemas.ai import (
    ActionPrioritizationResponse,
    AIStrategyModelOutput,
    AlternativeStrategiesResponse,
    CopilotResponse,
    CountryComparisonResponse,
    DocumentAnalysisResponse,
    PathwayProbabilityResponse,
    ProfileWeaknessResponse,
    TimelineSimulationResponse,
)
from app.services.ai.ai_client import (
    ActionPrioritizationClientResult,
    AlternativeStrategiesClientResult,
    AIClientConfigurationError,
    AIClientResponseError,
    AIClientResult,
    CountryComparisonClientResult,
    CopilotClientResult,
    DocumentAnalysisClientResult,
    PathwayProbabilityClientResult,
    ProfileWeaknessClientResult,
    TimelineSimulationClientResult,
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

    async def generate_pathway_probability(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> PathwayProbabilityClientResult:
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
                response_format=PathwayProbabilityResponse,
            )
        except APITimeoutError as exc:
            logger.warning("ai.openai_probability_timeout", exc_info=exc)
            raise AIClientResponseError("OpenAI request timed out.") from exc
        except APIConnectionError as exc:
            logger.warning("ai.openai_probability_connection_error", exc_info=exc)
            raise AIClientResponseError("OpenAI connection failed.") from exc
        except APIStatusError as exc:
            logger.warning(
                "ai.openai_probability_status_error",
                extra={"status_code": exc.status_code, "request_id": exc.request_id},
                exc_info=exc,
            )
            raise AIClientResponseError(
                f"OpenAI returned HTTP {exc.status_code}."
            ) from exc
        except Exception as exc:  # pragma: no cover - SDK boundary
            logger.exception("ai.openai_probability_unexpected_error", exc_info=exc)
            raise AIClientResponseError("OpenAI request failed unexpectedly.") from exc

        choice = response.choices[0]
        parsed = choice.message.parsed
        refusal = getattr(choice.message, "refusal", None)

        if refusal:
            raise AIClientResponseError(
                "OpenAI refused to produce a pathway probability response."
            )

        if parsed is None:
            raise AIClientResponseError(
                "OpenAI returned an empty pathway probability payload."
            )

        return PathwayProbabilityClientResult(
            output=parsed,
            model=model,
            provider="openai",
            request_id=getattr(response, "_request_id", None),
        )

    async def generate_timeline_simulation(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> TimelineSimulationClientResult:
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
                response_format=TimelineSimulationResponse,
            )
        except APITimeoutError as exc:
            logger.warning("ai.openai_timeline_timeout", exc_info=exc)
            raise AIClientResponseError("OpenAI request timed out.") from exc
        except APIConnectionError as exc:
            logger.warning("ai.openai_timeline_connection_error", exc_info=exc)
            raise AIClientResponseError("OpenAI connection failed.") from exc
        except APIStatusError as exc:
            logger.warning(
                "ai.openai_timeline_status_error",
                extra={"status_code": exc.status_code, "request_id": exc.request_id},
                exc_info=exc,
            )
            raise AIClientResponseError(
                f"OpenAI returned HTTP {exc.status_code}."
            ) from exc
        except Exception as exc:  # pragma: no cover - SDK boundary
            logger.exception("ai.openai_timeline_unexpected_error", exc_info=exc)
            raise AIClientResponseError("OpenAI request failed unexpectedly.") from exc

        choice = response.choices[0]
        parsed = choice.message.parsed
        refusal = getattr(choice.message, "refusal", None)

        if refusal:
            raise AIClientResponseError(
                "OpenAI refused to produce a timeline simulation response."
            )

        if parsed is None:
            raise AIClientResponseError(
                "OpenAI returned an empty timeline simulation payload."
            )

        return TimelineSimulationClientResult(
            output=parsed,
            model=model,
            provider="openai",
            request_id=getattr(response, "_request_id", None),
        )

    async def generate_country_comparison(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> CountryComparisonClientResult:
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
                response_format=CountryComparisonResponse,
            )
        except APITimeoutError as exc:
            logger.warning("ai.openai_country_comparison_timeout", exc_info=exc)
            raise AIClientResponseError("OpenAI request timed out.") from exc
        except APIConnectionError as exc:
            logger.warning(
                "ai.openai_country_comparison_connection_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI connection failed.") from exc
        except APIStatusError as exc:
            logger.warning(
                "ai.openai_country_comparison_status_error",
                extra={"status_code": exc.status_code, "request_id": exc.request_id},
                exc_info=exc,
            )
            raise AIClientResponseError(
                f"OpenAI returned HTTP {exc.status_code}."
            ) from exc
        except Exception as exc:  # pragma: no cover - SDK boundary
            logger.exception(
                "ai.openai_country_comparison_unexpected_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI request failed unexpectedly.") from exc

        choice = response.choices[0]
        parsed = choice.message.parsed
        refusal = getattr(choice.message, "refusal", None)

        if refusal:
            raise AIClientResponseError(
                "OpenAI refused to produce a country comparison response."
            )

        if parsed is None:
            raise AIClientResponseError(
                "OpenAI returned an empty country comparison payload."
            )

        return CountryComparisonClientResult(
            output=parsed,
            model=model,
            provider="openai",
            request_id=getattr(response, "_request_id", None),
        )

    async def generate_alternative_strategies(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> AlternativeStrategiesClientResult:
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
                response_format=AlternativeStrategiesResponse,
            )
        except APITimeoutError as exc:
            logger.warning("ai.openai_alternative_strategies_timeout", exc_info=exc)
            raise AIClientResponseError("OpenAI request timed out.") from exc
        except APIConnectionError as exc:
            logger.warning(
                "ai.openai_alternative_strategies_connection_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI connection failed.") from exc
        except APIStatusError as exc:
            logger.warning(
                "ai.openai_alternative_strategies_status_error",
                extra={"status_code": exc.status_code, "request_id": exc.request_id},
                exc_info=exc,
            )
            raise AIClientResponseError(
                f"OpenAI returned HTTP {exc.status_code}."
            ) from exc
        except Exception as exc:  # pragma: no cover - SDK boundary
            logger.exception(
                "ai.openai_alternative_strategies_unexpected_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI request failed unexpectedly.") from exc

        choice = response.choices[0]
        parsed = choice.message.parsed
        refusal = getattr(choice.message, "refusal", None)

        if refusal:
            raise AIClientResponseError(
                "OpenAI refused to produce an alternative strategies response."
            )

        if parsed is None:
            raise AIClientResponseError(
                "OpenAI returned an empty alternative strategies payload."
            )

        return AlternativeStrategiesClientResult(
            output=parsed,
            model=model,
            provider="openai",
            request_id=getattr(response, "_request_id", None),
        )

    async def generate_action_prioritization(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> ActionPrioritizationClientResult:
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
                response_format=ActionPrioritizationResponse,
            )
        except APITimeoutError as exc:
            logger.warning("ai.openai_action_prioritization_timeout", exc_info=exc)
            raise AIClientResponseError("OpenAI request timed out.") from exc
        except APIConnectionError as exc:
            logger.warning(
                "ai.openai_action_prioritization_connection_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI connection failed.") from exc
        except APIStatusError as exc:
            logger.warning(
                "ai.openai_action_prioritization_status_error",
                extra={"status_code": exc.status_code, "request_id": exc.request_id},
                exc_info=exc,
            )
            raise AIClientResponseError(
                f"OpenAI returned HTTP {exc.status_code}."
            ) from exc
        except Exception as exc:  # pragma: no cover - SDK boundary
            logger.exception(
                "ai.openai_action_prioritization_unexpected_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI request failed unexpectedly.") from exc

        choice = response.choices[0]
        parsed = choice.message.parsed
        refusal = getattr(choice.message, "refusal", None)

        if refusal:
            raise AIClientResponseError(
                "OpenAI refused to produce an action prioritization response."
            )

        if parsed is None:
            raise AIClientResponseError(
                "OpenAI returned an empty action prioritization payload."
            )

        return ActionPrioritizationClientResult(
            output=parsed,
            model=model,
            provider="openai",
            request_id=getattr(response, "_request_id", None),
        )

    async def generate_profile_weakness_analysis(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> ProfileWeaknessClientResult:
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
                response_format=ProfileWeaknessResponse,
            )
        except APITimeoutError as exc:
            logger.warning("ai.openai_profile_weakness_timeout", exc_info=exc)
            raise AIClientResponseError("OpenAI request timed out.") from exc
        except APIConnectionError as exc:
            logger.warning(
                "ai.openai_profile_weakness_connection_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI connection failed.") from exc
        except APIStatusError as exc:
            logger.warning(
                "ai.openai_profile_weakness_status_error",
                extra={"status_code": exc.status_code, "request_id": exc.request_id},
                exc_info=exc,
            )
            raise AIClientResponseError(
                f"OpenAI returned HTTP {exc.status_code}."
            ) from exc
        except Exception as exc:  # pragma: no cover - SDK boundary
            logger.exception(
                "ai.openai_profile_weakness_unexpected_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI request failed unexpectedly.") from exc

        choice = response.choices[0]
        parsed = choice.message.parsed
        refusal = getattr(choice.message, "refusal", None)

        if refusal:
            raise AIClientResponseError(
                "OpenAI refused to produce a profile weakness response."
            )

        if parsed is None:
            raise AIClientResponseError(
                "OpenAI returned an empty profile weakness payload."
            )

        return ProfileWeaknessClientResult(
            output=parsed,
            model=model,
            provider="openai",
            request_id=getattr(response, "_request_id", None),
        )

    async def generate_document_analysis(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> DocumentAnalysisClientResult:
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
                response_format=DocumentAnalysisResponse,
            )
        except APITimeoutError as exc:
            logger.warning("ai.openai_document_analysis_timeout", exc_info=exc)
            raise AIClientResponseError("OpenAI request timed out.") from exc
        except APIConnectionError as exc:
            logger.warning(
                "ai.openai_document_analysis_connection_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI connection failed.") from exc
        except APIStatusError as exc:
            logger.warning(
                "ai.openai_document_analysis_status_error",
                extra={"status_code": exc.status_code, "request_id": exc.request_id},
                exc_info=exc,
            )
            raise AIClientResponseError(
                f"OpenAI returned HTTP {exc.status_code}."
            ) from exc
        except Exception as exc:  # pragma: no cover - SDK boundary
            logger.exception(
                "ai.openai_document_analysis_unexpected_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI request failed unexpectedly.") from exc

        choice = response.choices[0]
        parsed = choice.message.parsed
        refusal = getattr(choice.message, "refusal", None)

        if refusal:
            raise AIClientResponseError(
                "OpenAI refused to produce a document analysis response."
            )

        if parsed is None:
            raise AIClientResponseError(
                "OpenAI returned an empty document analysis payload."
            )

        return DocumentAnalysisClientResult(
            output=parsed,
            model=model,
            provider="openai",
            request_id=getattr(response, "_request_id", None),
        )

    async def generate_copilot_response(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> CopilotClientResult:
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
                response_format=CopilotResponse,
            )
        except APITimeoutError as exc:
            logger.warning("ai.openai_copilot_timeout", exc_info=exc)
            raise AIClientResponseError("OpenAI request timed out.") from exc
        except APIConnectionError as exc:
            logger.warning(
                "ai.openai_copilot_connection_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI connection failed.") from exc
        except APIStatusError as exc:
            logger.warning(
                "ai.openai_copilot_status_error",
                extra={"status_code": exc.status_code, "request_id": exc.request_id},
                exc_info=exc,
            )
            raise AIClientResponseError(
                f"OpenAI returned HTTP {exc.status_code}."
            ) from exc
        except Exception as exc:  # pragma: no cover - SDK boundary
            logger.exception(
                "ai.openai_copilot_unexpected_error",
                exc_info=exc,
            )
            raise AIClientResponseError("OpenAI request failed unexpectedly.") from exc

        choice = response.choices[0]
        parsed = choice.message.parsed
        refusal = getattr(choice.message, "refusal", None)

        if refusal:
            raise AIClientResponseError(
                "OpenAI refused to produce a copilot response."
            )

        if parsed is None:
            raise AIClientResponseError(
                "OpenAI returned an empty copilot payload."
            )

        return CopilotClientResult(
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
