from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.ai import CopilotRequest, CopilotResponse
from app.services.ai.ai_client import (
    AIClient,
    AIClientConfigurationError,
    AIClientResponseError,
)
from app.services.ai.ai_prompt_builder import CopilotPromptBuilder
from app.services.cases.case_service import CaseService
from app.services.profile.profile_service import ProfileService


class CopilotService:
    """Generate a practical immigration copilot response from profile and case context."""

    def __init__(
        self,
        *,
        ai_client: AIClient,
        case_service: CaseService,
        profile_service: ProfileService,
        prompt_builder: CopilotPromptBuilder,
    ) -> None:
        self._ai_client = ai_client
        self._case_service = case_service
        self._profile_service = profile_service
        self._prompt_builder = prompt_builder

    async def respond(
        self,
        *,
        session: AsyncSession,
        user: User,
        payload: CopilotRequest,
    ) -> CopilotResponse:
        profile = await self._profile_service.get_or_create_profile(session, user)
        immigration_case = await self._case_service.get_case(session, user, payload.case_id)
        prompt_bundle = self._prompt_builder.build(
            profile=profile,
            case=immigration_case,
            previous_messages=[
                {
                    "role": message.role,
                    "content": message.content,
                }
                for message in payload.previous_messages
            ],
            question=payload.question,
        )

        try:
            result = await self._ai_client.generate_copilot_response(
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
