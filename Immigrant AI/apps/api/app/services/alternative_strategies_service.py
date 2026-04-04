from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.ai import AlternativeStrategiesRequest, AlternativeStrategiesResponse
from app.services.ai_client import (
    AIClient,
    AIClientConfigurationError,
    AIClientResponseError,
)
from app.services.ai_prompt_builder import AlternativeStrategiesPromptBuilder
from app.services.profile_service import ProfileService


class AlternativeStrategiesService:
    """Generate three alternative immigration strategy plans for a target country."""

    def __init__(
        self,
        *,
        ai_client: AIClient,
        profile_service: ProfileService,
        prompt_builder: AlternativeStrategiesPromptBuilder,
    ) -> None:
        self._ai_client = ai_client
        self._profile_service = profile_service
        self._prompt_builder = prompt_builder

    async def generate(
        self,
        *,
        session: AsyncSession,
        user: User,
        payload: AlternativeStrategiesRequest,
    ) -> AlternativeStrategiesResponse:
        profile = await self._profile_service.get_or_create_profile(session, user)
        prompt_bundle = self._prompt_builder.build(
            profile=profile,
            target_country=payload.target_country,
        )

        try:
            result = await self._ai_client.generate_alternative_strategies(
                system_prompt=prompt_bundle.system_prompt,
                user_prompt=prompt_bundle.user_prompt,
            )
        except AIClientConfigurationError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc
        except AIClientResponseError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(exc),
            ) from exc

        return result.output
