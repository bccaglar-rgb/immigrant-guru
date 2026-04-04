from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.ai import ActionPrioritizationRequest, ActionPrioritizationResponse
from app.services.ai_client import (
    AIClient,
    AIClientConfigurationError,
    AIClientResponseError,
)
from app.services.ai_prompt_builder import ActionPrioritizationPromptBuilder
from app.services.case_service import CaseService
from app.services.profile_service import ProfileService


class ActionPrioritizationService:
    """Generate the single most impactful next action for a user's case."""

    def __init__(
        self,
        *,
        ai_client: AIClient,
        case_service: CaseService,
        profile_service: ProfileService,
        prompt_builder: ActionPrioritizationPromptBuilder,
    ) -> None:
        self._ai_client = ai_client
        self._case_service = case_service
        self._profile_service = profile_service
        self._prompt_builder = prompt_builder

    async def prioritize(
        self,
        *,
        session: AsyncSession,
        user: User,
        payload: ActionPrioritizationRequest,
    ) -> ActionPrioritizationResponse:
        profile = await self._profile_service.get_or_create_profile(session, user)
        immigration_case = await self._case_service.get_case(session, user, payload.case_id)
        prompt_bundle = self._prompt_builder.build(
            profile=profile,
            case=immigration_case,
            missing_information=payload.missing_information,
        )

        try:
            result = await self._ai_client.generate_action_prioritization(
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
