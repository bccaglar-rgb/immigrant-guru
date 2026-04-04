from __future__ import annotations

from typing import Sequence
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.copilot_message import CopilotMessage
from app.models.copilot_thread import CopilotThread
from app.models.enums import CopilotMessageRole
from app.models.user import User
from app.schemas.copilot import (
    CopilotMessageCreate,
    CopilotMessageExchangeRead,
    CopilotThreadMessageRead,
    CopilotThreadRead,
)
from app.services.ai_client import (
    AIClient,
    AIClientConfigurationError,
    AIClientResponseError,
)
from app.services.ai_prompt_builder import CopilotPromptBuilder
from app.services.case_service import CaseService
from app.services.context_assembler_service import ContextAssemblerService


class CopilotChatService:
    """Persist case-scoped copilot threads and messages."""

    _history_limit = 20
    _thread_message_limit = 100

    def __init__(
        self,
        *,
        ai_client: AIClient,
        case_service: CaseService,
        context_assembler: ContextAssemblerService,
        prompt_builder: CopilotPromptBuilder,
    ) -> None:
        self._ai_client = ai_client
        self._case_service = case_service
        self._context_assembler = context_assembler
        self._prompt_builder = prompt_builder

    async def get_or_create_thread(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
    ) -> CopilotThreadRead:
        await self._case_service.get_case(session, user, case_id)
        thread = await self._get_or_create_thread_record(
            session=session,
            user=user,
            case_id=case_id,
        )
        messages = await self._list_thread_messages(
            session=session,
            thread_id=thread.id,
            limit=self._thread_message_limit,
        )
        return self._serialize_thread(thread=thread, messages=messages)

    async def post_user_message(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
        payload: CopilotMessageCreate,
    ) -> CopilotMessageExchangeRead:
        await self._case_service.get_case(session, user, case_id)
        thread = await self._get_or_create_thread_record(
            session=session,
            user=user,
            case_id=case_id,
        )
        existing_messages = await self._list_thread_messages(
            session=session,
            thread_id=thread.id,
            limit=self._history_limit,
        )
        context_snapshot = await self._context_assembler.assemble(
            session=session,
            user=user,
            case_id=case_id,
        )
        previous_messages = [
            {"role": message.role.value, "content": message.content}
            for message in existing_messages
        ]
        previous_messages.append(
            {"role": CopilotMessageRole.USER.value, "content": payload.content}
        )
        prompt_bundle = self._prompt_builder.build(
            profile=user.profile,
            case=await self._case_service.get_case(session, user, case_id),
            previous_messages=previous_messages,
            question=payload.content,
            context_snapshot=context_snapshot.to_prompt_payload(),
        )

        try:
            result = await self._ai_client.generate_copilot_response(
                system_prompt=prompt_bundle.system_prompt,
                user_prompt=prompt_bundle.user_prompt,
            )
        except AIClientConfigurationError as exc:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc
        except AIClientResponseError as exc:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(exc),
            ) from exc

        user_message = CopilotMessage(
            thread_id=thread.id,
            case_id=case_id,
            user_id=user.id,
            role=CopilotMessageRole.USER,
            content=payload.content.strip(),
            metadata_json={"source": "case_copilot"},
        )
        assistant_message = CopilotMessage(
            thread_id=thread.id,
            case_id=case_id,
            user_id=user.id,
            role=CopilotMessageRole.ASSISTANT,
            content=result.output.answer,
            metadata_json={
                "suggested_actions": list(result.output.suggested_actions),
                "related_risks": list(result.output.related_risks),
                "context_version": "case_copilot_v1",
            },
        )

        session.add(user_message)
        session.add(assistant_message)
        await session.commit()
        await session.refresh(thread)
        await session.refresh(user_message)
        await session.refresh(assistant_message)
        messages = await self._list_thread_messages(
            session=session,
            thread_id=thread.id,
            limit=self._thread_message_limit,
        )

        return CopilotMessageExchangeRead(
            thread=self._serialize_thread(thread=thread, messages=messages),
            user_message=CopilotThreadMessageRead.model_validate(user_message),
            assistant_message=CopilotThreadMessageRead.model_validate(
                assistant_message
            ),
        )

    async def _get_or_create_thread_record(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
    ) -> CopilotThread:
        result = await session.execute(
            select(CopilotThread).where(
                CopilotThread.case_id == case_id,
                CopilotThread.user_id == user.id,
            )
        )
        thread = result.scalar_one_or_none()
        if thread is not None:
            return thread

        thread = CopilotThread(case_id=case_id, user_id=user.id)
        session.add(thread)
        await session.flush()
        return thread

    async def _list_thread_messages(
        self,
        *,
        session: AsyncSession,
        thread_id: UUID,
        limit: int,
    ) -> list[CopilotMessage]:
        result = await session.execute(
            select(CopilotMessage)
            .where(CopilotMessage.thread_id == thread_id)
            .order_by(desc(CopilotMessage.created_at))
            .limit(limit)
        )
        return list(reversed(list(result.scalars().all())))

    @staticmethod
    def _serialize_thread(
        *,
        thread: CopilotThread,
        messages: Sequence[CopilotMessage],
    ) -> CopilotThreadRead:
        return CopilotThreadRead(
            id=thread.id,
            case_id=thread.case_id,
            user_id=thread.user_id,
            created_at=thread.created_at,
            updated_at=thread.updated_at,
            messages=[
                CopilotThreadMessageRead.model_validate(message)
                for message in messages
            ],
        )
