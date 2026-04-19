from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Sequence

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.ai import StrategyContextMode
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.user_profile import UserProfileRead

from app.services.ai.prompts.bundles import PathwayProbabilityPromptBundle

class PathwayProbabilityPromptBuilder:
    """Build a strict JSON probability-evaluation prompt for a specific visa pathway."""

    def build(
        self,
        *,
        profile: UserProfile,
        visa_type: str,
    ) -> PathwayProbabilityPromptBundle:
        profile_payload: dict[str, Any] = UserProfileRead.model_validate(
            profile
        ).model_dump(mode="json")
        normalized_visa_type = visa_type.strip()

        structured_context = {
            "visa_type": normalized_visa_type,
            "profile": profile_payload,
        }

        system_prompt = (
            "You are an immigration evaluation engine. "
            "Your task is to estimate the probability of success for a given visa pathway. "
            "You must NOT give legal advice. "
            "You must give a probability score based on patterns, requirements, and profile strength. "
            "Do not overclaim or imply guaranteed approval. "
            "If profile data is incomplete, lower confidence and mention the missing context in weaknesses, risk factors, or improvement actions as appropriate. "
            "Return STRICT JSON only with the exact keys: "
            "probability_score, confidence_level, strengths, weaknesses, key_risk_factors, improvement_actions, reasoning_summary. "
            "confidence_level must be one of: LOW, MEDIUM, HIGH."
        )

        user_prompt = "\n".join(
            [
                "INPUT:",
                "User Profile:",
                f"- Nationality: {self._format_value(profile_payload.get('nationality'))}",
                f"- Education: {self._format_value(profile_payload.get('education_level'))}",
                f"- Profession: {self._format_value(profile_payload.get('profession'))}",
                f"- Years of Experience: {self._format_value(profile_payload.get('years_of_experience'))}",
                f"- English Level: {self._format_value(profile_payload.get('english_level'))}",
                f"- Available Capital: {self._format_value(profile_payload.get('available_capital'))}",
                f"- Criminal Record: {self._format_boolean(profile_payload.get('criminal_record_flag'))}",
                f"- Prior Visa Refusal: {self._format_boolean(profile_payload.get('prior_visa_refusal_flag'))}",
                "",
                "Target Pathway:",
                normalized_visa_type,
                "",
                "OUTPUT FORMAT (STRICT JSON):",
                "{",
                '  "probability_score": 0-100,',
                '  "confidence_level": "LOW | MEDIUM | HIGH",',
                '  "strengths": ["..."],',
                '  "weaknesses": ["..."],',
                '  "key_risk_factors": ["..."],',
                '  "improvement_actions": ["..."],',
                '  "reasoning_summary": "short explanation"',
                "}",
            ]
        )

        return PathwayProbabilityPromptBundle(
            structured_context=structured_context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )

    @staticmethod
    def _format_value(value: Any) -> str:
        if value is None:
            return "Not provided"
        if isinstance(value, str):
            return value if value.strip() else "Not provided"
        return str(value)

    @staticmethod
    def _format_boolean(value: Any) -> str:
        if value is True:
            return "Yes"
        if value is False:
            return "No"
        return "Unknown"


