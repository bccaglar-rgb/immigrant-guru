from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Sequence

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.ai import StrategyContextMode
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.user_profile import UserProfileRead

from app.services.ai.prompts.bundles import TimelineSimulationPromptBundle

class TimelineSimulationPromptBuilder:
    """Build a strict JSON timeline simulation prompt for a target pathway."""

    def build(
        self,
        *,
        profile: UserProfile,
        visa_type: str,
        target_country: str,
    ) -> TimelineSimulationPromptBundle:
        profile_payload: dict[str, Any] = UserProfileRead.model_validate(
            profile
        ).model_dump(mode="json")
        normalized_visa_type = visa_type.strip()
        normalized_target_country = target_country.strip()

        structured_context = {
            "visa_type": normalized_visa_type,
            "target_country": normalized_target_country,
            "profile_summary": profile_payload,
        }

        system_prompt = (
            "You are an immigration timeline simulation engine. "
            "Estimate realistic time durations for the given immigration pathway based on typical processing steps. "
            "Do not give legal advice or guarantee processing outcomes. "
            "Use realistic, conservative timing that reflects preparation, filing, review, and decision phases. "
            "If profile detail is incomplete, reflect that uncertainty in delay_risks, step descriptions, or total duration. "
            "Return STRICT JSON only with the exact keys: total_estimated_duration_months, steps, delay_risks, acceleration_tips. "
            "Each step must contain: step_name, estimated_duration_months, description."
        )

        user_prompt = "\n".join(
            [
                "INPUT:",
                f"Visa Type: {normalized_visa_type}",
                f"Country: {normalized_target_country}",
                f"User Profile: {json.dumps(profile_payload, ensure_ascii=True)}",
                "",
                "OUTPUT FORMAT:",
                "{",
                '  "total_estimated_duration_months": number,',
                '  "steps": [',
                "    {",
                '      "step_name": "...",',
                '      "estimated_duration_months": number,',
                '      "description": "..."',
                "    }",
                "  ],",
                '  "delay_risks": ["..."],',
                '  "acceleration_tips": ["..."]',
                "}",
            ]
        )

        return TimelineSimulationPromptBundle(
            structured_context=structured_context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )


