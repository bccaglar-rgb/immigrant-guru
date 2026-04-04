from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.ai import PathwayProbabilityRequest, PathwayProbabilityResponse
from app.services.ai_client import (
    AIClient,
    AIClientConfigurationError,
    AIClientResponseError,
)
from app.services.ai_prompt_builder import PathwayProbabilityPromptBuilder
from app.services.profile_service import ProfileService


class AIPathwayProbabilityService:
    """Generate an AI-authored strict JSON probability estimate for a target visa pathway."""

    def __init__(
        self,
        *,
        ai_client: AIClient,
        profile_service: ProfileService,
        prompt_builder: PathwayProbabilityPromptBuilder,
    ) -> None:
        self._ai_client = ai_client
        self._profile_service = profile_service
        self._prompt_builder = prompt_builder

    async def evaluate(
        self,
        *,
        session: AsyncSession,
        user: User,
        payload: PathwayProbabilityRequest,
    ) -> PathwayProbabilityResponse:
        profile = await self._profile_service.get_or_create_profile(session, user)
        prompt_bundle = self._prompt_builder.build(
            profile=profile,
            visa_type=payload.visa_type,
        )

        try:
            result = await self._ai_client.generate_pathway_probability(
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
