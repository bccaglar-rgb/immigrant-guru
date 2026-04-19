from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Sequence

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.ai import StrategyContextMode
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.user_profile import UserProfileRead

from app.services.ai.prompts.bundles import CountryComparisonPromptBundle

class CountryComparisonPromptBuilder:
    """Build a strict JSON comparison prompt across multiple country options."""

    def build(
        self,
        *,
        profile: UserProfile,
        options: Sequence[dict[str, str]],
    ) -> CountryComparisonPromptBundle:
        profile_payload: dict[str, Any] = UserProfileRead.model_validate(
            profile
        ).model_dump(mode="json")
        normalized_options = [
            {
                "country": option["country"].strip(),
                "visa_type": option["visa_type"].strip(),
            }
            for option in options
        ]

        structured_context = {
            "profile_summary": profile_payload,
            "options": normalized_options,
        }

        system_prompt = (
            "You are an immigration comparison engine. "
            "Compare multiple countries and visa pathways for a given user. "
            "Do not give legal advice or imply guaranteed outcomes. "
            "Estimate comparative success probability, timing, cost, and difficulty using only the supplied profile and option set. "
            "If profile data is incomplete, keep the comparison conservative and reflect uncertainty in disadvantages or the reasoning. "
            "Return STRICT JSON only with the exact keys: comparison, best_option, reasoning. "
            "Each comparison item must contain: country, pathway, success_probability, estimated_time_months, cost_level, difficulty, key_advantages, key_disadvantages. "
            "cost_level must be one of: LOW, MEDIUM, HIGH. "
            "difficulty must be one of: LOW, MEDIUM, HIGH."
        )

        options_lines = []
        for option in normalized_options:
            options_lines.append(f"- {option['country']}: {option['visa_type']}")

        user_prompt = "\n".join(
            [
                "INPUT:",
                f"User Profile: {json.dumps(profile_payload, ensure_ascii=True)}",
                "Options:",
                *options_lines,
                "",
                "OUTPUT:",
                "{",
                '  "comparison": [',
                "    {",
                '      "country": "...",',
                '      "pathway": "...",',
                '      "success_probability": 0-100,',
                '      "estimated_time_months": number,',
                '      "cost_level": "LOW | MEDIUM | HIGH",',
                '      "difficulty": "LOW | MEDIUM | HIGH",',
                '      "key_advantages": ["..."],',
                '      "key_disadvantages": ["..."]',
                "    }",
                "  ],",
                '  "best_option": "...",',
                '  "reasoning": "..."',
                "}",
            ]
        )

        return CountryComparisonPromptBundle(
            structured_context=structured_context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )


