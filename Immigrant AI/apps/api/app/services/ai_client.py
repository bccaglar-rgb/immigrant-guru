from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.core.config import Settings
from app.schemas.ai import AIStrategyModelOutput


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


class AIClient(Protocol):
    """Provider interface for AI strategy generation."""

    async def generate_strategy(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> AIClientResult: ...


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


def build_ai_client(settings: Settings) -> AIClient:
    provider = settings.ai_provider.lower().strip()

    if provider == "openai":
        from app.services.openai_provider import OpenAIStrategyClient

        return OpenAIStrategyClient(settings)

    return DisabledAIClient(settings)
