from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Sequence

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.ai import StrategyContextMode
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.user_profile import UserProfileRead

from app.services.ai.prompts.bundles import AlternativeStrategiesPromptBundle

class AlternativeStrategiesPromptBuilder:
    """Build a strict JSON prompt for 3 alternative strategy plans."""

    def build(
        self,
        *,
        profile: UserProfile,
        target_country: str,
    ) -> AlternativeStrategiesPromptBundle:
        profile_payload: dict[str, Any] = UserProfileRead.model_validate(
            profile
        ).model_dump(mode="json")
        normalized_target_country = target_country.strip()

        structured_context = {
            "profile": profile_payload,
            "target_country": normalized_target_country,
        }

        system_prompt = (
            "You are a senior immigration strategist. "
            "Generate exactly 3 immigration pathways named Plan A, Plan B, and Plan C. "
            "Plan A must be the best immediate option. "
            "Plan B must be a fallback path if Plan A does not work. "
            "Plan C must be the long-term strategy. "
            "Each plan must be realistic, specific, and tailored to the supplied user profile and target country. "
            "Base every plan on the provided data only, and keep the reasoning grounded in profile strength, evidence quality, and pathway fit. "
            "Avoid generic or filler suggestions. "
            "Do not give legal advice or imply guaranteed approval. "
            "If profile data is incomplete, reduce probability, keep timelines conservative, and mention the uncertainty in risks or next_steps. "
            "Return STRICT JSON only with the exact keys: plans, recommended_plan, confidence_score. "
            "Each plan must contain the exact keys: name, pathway, why_it_fits, probability, timeline_months, cost_estimate, risks, next_steps. "
            "Plan names must be sequentially Plan A, Plan B, Plan C. "
            "The why_it_fits field must stay short, factual, and data-based. "
            "recommended_plan must match one of the returned plan names. "
            "confidence_score must be a 0 to 100 confidence score for the overall comparison."
        )

        user_prompt = "\n".join(
            [
                "INPUT:",
                f"User Profile: {json.dumps(profile_payload, ensure_ascii=True)}",
                f"Target Country: {normalized_target_country}",
                "",
                "OUTPUT:",
                "{",
                '  "plans": [',
                "    {",
                '      "name": "Plan A",',
                '      "pathway": "...",',
                '      "why_it_fits": "...",',
                '      "probability": 0-100,',
                '      "timeline_months": number,',
                '      "cost_estimate": "...",',
                '      "risks": ["..."],',
                '      "next_steps": ["..."]',
                "    }",
                "  ],",
                '  "recommended_plan": "...",',
                '  "confidence_score": 0-100',
                "}",
            ]
        )

        return AlternativeStrategiesPromptBundle(
            structured_context=structured_context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )


