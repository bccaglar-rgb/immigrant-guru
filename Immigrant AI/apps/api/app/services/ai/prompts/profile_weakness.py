from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Sequence

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.ai import StrategyContextMode
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.user_profile import UserProfileRead

from app.services.ai.prompts.bundles import ProfileWeaknessPromptBundle

class ProfileWeaknessPromptBuilder:
    """Build a strict JSON prompt for profile weakness analysis."""

    def build(
        self,
        *,
        profile: UserProfile,
    ) -> ProfileWeaknessPromptBundle:
        profile_payload: dict[str, Any] = UserProfileRead.model_validate(
            profile
        ).model_dump(mode="json")

        structured_context = {
            "profile": profile_payload,
        }

        system_prompt = (
            "You are an immigration weakness analysis engine. "
            "Identify the weakest parts of the user's profile. "
            "Do not give legal advice or imply guaranteed outcomes. "
            "Use only the supplied profile and focus on practical weaknesses that reduce readiness, evidence strength, or pathway flexibility. "
            "If the profile is incomplete, explicitly treat missing core data as weaknesses where appropriate. "
            "Return STRICT JSON only with the exact keys: weaknesses, priority_focus. "
            "Each weakness item must contain the exact keys: area, severity, why_it_matters, how_to_improve. "
            "severity must be one of: LOW, MEDIUM, HIGH."
        )

        user_prompt = "\n".join(
            [
                "INPUT:",
                f"User Profile: {json.dumps(profile_payload, ensure_ascii=True)}",
                "",
                "OUTPUT:",
                "{",
                '  "weaknesses": [',
                "    {",
                '      "area": "...",',
                '      "severity": "LOW | MEDIUM | HIGH",',
                '      "why_it_matters": "...",',
                '      "how_to_improve": ["..."]',
                "    }",
                "  ],",
                '  "priority_focus": "..."',
                "}",
            ]
        )

        return ProfileWeaknessPromptBundle(
            structured_context=structured_context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )


