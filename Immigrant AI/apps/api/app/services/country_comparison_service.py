from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.ai import CountryComparisonRequest, CountryComparisonResponse
from app.services.ai_client import (
    AIClient,
    AIClientConfigurationError,
    AIClientResponseError,
)
from app.services.ai_prompt_builder import CountryComparisonPromptBuilder
from app.services.profile_service import ProfileService


class CountryComparisonService:
    """Generate a structured multi-country comparison for the authenticated user."""

    def __init__(
        self,
        *,
        ai_client: AIClient,
        profile_service: ProfileService,
        prompt_builder: CountryComparisonPromptBuilder,
    ) -> None:
        self._ai_client = ai_client
        self._profile_service = profile_service
        self._prompt_builder = prompt_builder

    async def compare(
        self,
        *,
        session: AsyncSession,
        user: User,
        payload: CountryComparisonRequest,
    ) -> CountryComparisonResponse:
        profile = await self._profile_service.get_or_create_profile(session, user)
        prompt_bundle = self._prompt_builder.build(
            profile=profile,
            options=[
                {
                    "country": option.country,
                    "visa_type": option.visa_type,
                }
                for option in payload.options
            ],
        )

        try:
            result = await self._ai_client.generate_country_comparison(
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
