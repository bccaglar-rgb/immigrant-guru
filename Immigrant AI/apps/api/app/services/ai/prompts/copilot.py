from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Sequence

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.ai import StrategyContextMode
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.user_profile import UserProfileRead

from app.services.ai.prompts.bundles import CopilotPromptBundle

class CopilotPromptBuilder:
    """Build a strict JSON prompt for an immigration copilot response."""

    def build(
        self,
        *,
        profile: UserProfile,
        case: ImmigrationCase,
        previous_messages: Sequence[dict[str, str]],
        question: str,
        context_snapshot: dict[str, Any] | None = None,
    ) -> CopilotPromptBundle:
        profile_payload: dict[str, Any] = UserProfileRead.model_validate(
            profile
        ).model_dump(mode="json")
        case_payload: dict[str, Any] = ImmigrationCaseRead.model_validate(case).model_dump(
            mode="json"
        )
        normalized_history = [
            {
                "role": message["role"].strip(),
                "content": message["content"].strip(),
            }
            for message in previous_messages
        ]
        normalized_question = question.strip()

        structured_context = {
            "profile": profile_payload,
            "case": case_payload,
            "context_snapshot": context_snapshot or {},
            "history": normalized_history,
            "question": normalized_question,
        }

        system_prompt = (
            "You are an AI immigration copilot. "
            "You assist users throughout their immigration journey. "
            "Be practical, not generic. "
            "Always refer to the user's profile and case context. "
            "Suggest actions, not just explanations. "
            "Do not give legal advice or imply guaranteed outcomes. "
            "Use only the supplied profile, case, context snapshot, previous messages, and current question. "
            "Return STRICT JSON only with the exact keys: answer, suggested_actions, related_risks."
        )

        user_prompt = "\n".join(
            [
                "CONTEXT:",
                f"User Profile: {json.dumps(profile_payload, ensure_ascii=True)}",
                f"Case: {json.dumps(case_payload, ensure_ascii=True)}",
                f"Context Snapshot: {json.dumps(context_snapshot or {}, ensure_ascii=True)}",
                f"Previous Messages: {json.dumps(normalized_history, ensure_ascii=True)}",
                "",
                "USER QUESTION:",
                normalized_question,
                "",
                "OUTPUT:",
                "{",
                '  "answer": "...",',
                '  "suggested_actions": ["..."],',
                '  "related_risks": ["..."]',
                "}",
            ]
        )

        return CopilotPromptBundle(
            structured_context=structured_context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
