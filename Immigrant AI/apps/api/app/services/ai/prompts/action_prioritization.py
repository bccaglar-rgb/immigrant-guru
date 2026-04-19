from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Sequence

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.ai import StrategyContextMode
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.user_profile import UserProfileRead

from app.services.ai.prompts.bundles import ActionPrioritizationPromptBundle

class ActionPrioritizationPromptBuilder:
    """Build a strict JSON prompt for selecting the single next best action."""

    def build(
        self,
        *,
        profile: UserProfile,
        case: ImmigrationCase,
        missing_information: Sequence[str],
    ) -> ActionPrioritizationPromptBundle:
        profile_payload: dict[str, Any] = UserProfileRead.model_validate(
            profile
        ).model_dump(mode="json")
        case_payload: dict[str, Any] = ImmigrationCaseRead.model_validate(case).model_dump(
            mode="json"
        )

        structured_context = {
            "profile": profile_payload,
            "case": case_payload,
            "missing_information": list(missing_information),
        }

        system_prompt = (
            "You are an immigration action prioritization engine. "
            "Your job is to select the single most impactful next action. "
            "Do not give legal advice or imply guaranteed results. "
            "Use only the supplied user profile, case status, and missing information. "
            "Prefer the action that most reduces uncertainty, improves pathway readiness, or removes a critical blocker. "
            "If the profile or case is incomplete, choose the action that closes the most material gap first. "
            "Return STRICT JSON only with the exact keys: next_best_action, why_this_matters, impact_level, urgency. "
            "impact_level must be one of: LOW, MEDIUM, HIGH. "
            "urgency must be one of: LOW, MEDIUM, HIGH."
        )

        user_prompt = "\n".join(
            [
                "INPUT:",
                f"User Profile: {json.dumps(profile_payload, ensure_ascii=True)}",
                f"Case Status: {json.dumps(case_payload, ensure_ascii=True)}",
                f"Missing Information: {json.dumps(list(missing_information), ensure_ascii=True)}",
                "",
                "OUTPUT:",
                "{",
                '  "next_best_action": "...",',
                '  "why_this_matters": "...",',
                '  "impact_level": "LOW | MEDIUM | HIGH",',
                '  "urgency": "LOW | MEDIUM | HIGH"',
                "}",
            ]
        )

        return ActionPrioritizationPromptBundle(
            structured_context=structured_context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )


