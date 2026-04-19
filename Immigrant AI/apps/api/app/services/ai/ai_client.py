from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

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


class AIClientError(RuntimeError):
    """Base error raised for AI provider failures."""


class AIClientConfigurationError(AIClientError):
    """Raised when the AI provider is not configured correctly."""


class AIClientResponseError(AIClientError):
    """Raised when the AI provider returns an invalid response."""


@dataclass(frozen=True)
class AIClientResult:
    output: AIStrategyModelOutput
    model: str
    provider: str
    request_id: str | None = None


@dataclass(frozen=True)
class PathwayProbabilityClientResult:
    output: PathwayProbabilityResponse
    model: str
    provider: str
    request_id: str | None = None


@dataclass(frozen=True)
class TimelineSimulationClientResult:
    output: TimelineSimulationResponse
    model: str
    provider: str
    request_id: str | None = None


@dataclass(frozen=True)
class CountryComparisonClientResult:
    output: CountryComparisonResponse
    model: str
    provider: str
    request_id: str | None = None


@dataclass(frozen=True)
class AlternativeStrategiesClientResult:
    output: AlternativeStrategiesResponse
    model: str
    provider: str
    request_id: str | None = None


@dataclass(frozen=True)
class ActionPrioritizationClientResult:
    output: ActionPrioritizationResponse
    model: str
    provider: str
    request_id: str | None = None


@dataclass(frozen=True)
class ProfileWeaknessClientResult:
    output: ProfileWeaknessResponse
    model: str
    provider: str
    request_id: str | None = None


@dataclass(frozen=True)
class DocumentAnalysisClientResult:
    output: DocumentAnalysisResponse
    model: str
    provider: str
    request_id: str | None = None


@dataclass(frozen=True)
class CopilotClientResult:
    output: CopilotResponse
    model: str
    provider: str
    request_id: str | None = None


class AIClient(Protocol):
    """Provider interface for AI strategy generation."""

    async def generate_strategy(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> AIClientResult: ...

    async def generate_pathway_probability(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> PathwayProbabilityClientResult: ...

    async def generate_timeline_simulation(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> TimelineSimulationClientResult: ...

    async def generate_country_comparison(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> CountryComparisonClientResult: ...

    async def generate_alternative_strategies(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> AlternativeStrategiesClientResult: ...

    async def generate_action_prioritization(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> ActionPrioritizationClientResult: ...

    async def generate_profile_weakness_analysis(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> ProfileWeaknessClientResult: ...

    async def generate_document_analysis(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> DocumentAnalysisClientResult: ...

    async def generate_copilot_response(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> CopilotClientResult: ...


class DisabledAIClient:
    """Safe placeholder client when AI is not configured."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def generate_strategy(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> AIClientResult:
        del system_prompt, user_prompt
        raise AIClientConfigurationError(
            "AI provider is not configured. Set AI_PROVIDER=openai and provide OpenAI credentials."
        )

    async def generate_pathway_probability(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> PathwayProbabilityClientResult:
        del system_prompt, user_prompt
        raise AIClientConfigurationError(
            "AI provider is not configured. Set AI_PROVIDER=openai and provide OpenAI credentials."
        )

    async def generate_timeline_simulation(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> TimelineSimulationClientResult:
        del system_prompt, user_prompt
        raise AIClientConfigurationError(
            "AI provider is not configured. Set AI_PROVIDER=openai and provide OpenAI credentials."
        )

    async def generate_country_comparison(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> CountryComparisonClientResult:
        del system_prompt, user_prompt
        raise AIClientConfigurationError(
            "AI provider is not configured. Set AI_PROVIDER=openai and provide OpenAI credentials."
        )

    async def generate_alternative_strategies(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> AlternativeStrategiesClientResult:
        del system_prompt, user_prompt
        raise AIClientConfigurationError(
            "AI provider is not configured. Set AI_PROVIDER=openai and provide OpenAI credentials."
        )

    async def generate_action_prioritization(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> ActionPrioritizationClientResult:
        del system_prompt, user_prompt
        raise AIClientConfigurationError(
            "AI provider is not configured. Set AI_PROVIDER=openai and provide OpenAI credentials."
        )

    async def generate_profile_weakness_analysis(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> ProfileWeaknessClientResult:
        del system_prompt, user_prompt
        raise AIClientConfigurationError(
            "AI provider is not configured. Set AI_PROVIDER=openai and provide OpenAI credentials."
        )

    async def generate_document_analysis(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> DocumentAnalysisClientResult:
        del system_prompt, user_prompt
        raise AIClientConfigurationError(
            "AI provider is not configured. Set AI_PROVIDER=openai and provide OpenAI credentials."
        )

    async def generate_copilot_response(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> CopilotClientResult:
        del system_prompt, user_prompt
        raise AIClientConfigurationError(
            "AI provider is not configured. Set AI_PROVIDER=openai and provide OpenAI credentials."
        )


def build_ai_client(settings: Settings) -> AIClient:
    provider = settings.ai_provider.lower().strip()

    if provider == "openai":
        from app.services.ai.openai_provider import OpenAIStrategyClient

        return OpenAIStrategyClient(settings)

    return DisabledAIClient(settings)
