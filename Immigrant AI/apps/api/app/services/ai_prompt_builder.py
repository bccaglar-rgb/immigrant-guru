from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Sequence

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.ai import StrategyContextMode
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.user_profile import UserProfileRead


@dataclass(frozen=True)
class StrategyPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class PathwayProbabilityPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class TimelineSimulationPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class CountryComparisonPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class AlternativeStrategiesPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class ActionPrioritizationPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class ProfileWeaknessPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class DocumentAnalysisPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class CopilotPromptBundle:
    structured_context: dict[str, Any]
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True)
class GroundingPromptReference:
    source_id: str
    source_name: str
    source_type: str
    country: str | None
    visa_type: str | None
    language: str | None
    authority_level: str
    published_at: str | None
    verified_at: str | None
    relevance_score: float
    match_reason: str
    excerpt: str


class StrategyPromptBuilder:
    """Build structured strategy prompts from user, case, and profile data."""

    _profile_field_labels = {
        "nationality": "nationality",
        "current_country": "current country",
        "target_country": "target country",
        "education_level": "education level",
        "english_level": "English level",
        "profession": "profession",
        "years_of_experience": "years of experience",
        "available_capital": "available capital",
        "relocation_timeline": "relocation timeline",
    }

    _case_field_labels = {
        "target_country": "case target country",
        "target_program": "target program",
        "current_stage": "current stage",
        "notes": "case notes",
    }

    _grounding_excerpt_limit = 280

    def build(
        self,
        *,
        case: ImmigrationCase,
        profile: UserProfile,
        question: str,
        context_mode: StrategyContextMode,
        critical_missing_information: Sequence[str] | None = None,
        helpful_missing_information: Sequence[str] | None = None,
        grounded_references: Sequence[GroundingPromptReference] | None = None,
        grounding_backend: str | None = None,
    ) -> StrategyPromptBundle:
        case_payload: dict[str, Any] = ImmigrationCaseRead.model_validate(case).model_dump(
            mode="json"
        )
        profile_payload: dict[str, Any] = UserProfileRead.model_validate(
            profile
        ).model_dump(mode="json")

        structured_context = {
            "context_mode": context_mode.value,
            "case": case_payload,
            "profile": profile_payload,
            "missing_profile_fields": self._missing_profile_fields(profile_payload),
            "missing_case_fields": self._missing_case_fields(case_payload),
            "critical_missing_information": list(critical_missing_information or []),
            "helpful_missing_information": list(helpful_missing_information or []),
            "grounding": {
                "enabled": bool(grounded_references),
                "backend": grounding_backend,
                "references": [
                    {
                        "source_id": reference.source_id,
                        "source_name": reference.source_name,
                        "source_type": reference.source_type,
                        "country": reference.country,
                        "visa_type": reference.visa_type,
                        "language": reference.language,
                        "authority_level": reference.authority_level,
                        "published_at": reference.published_at,
                        "verified_at": reference.verified_at,
                        "relevance_score": reference.relevance_score,
                        "match_reason": reference.match_reason,
                        "excerpt": reference.excerpt,
                    }
                    for reference in grounded_references or []
                ],
            },
            "question": question,
        }

        filtered_context = self._filter_context(structured_context, context_mode)
        system_prompt = self._build_system_prompt(
            grounding_enabled=structured_context["grounding"]["enabled"]
        )
        user_prompt = self._build_user_prompt(
            filtered_context=filtered_context,
            question=question,
        )

        return StrategyPromptBundle(
            structured_context=structured_context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )

    @staticmethod
    def _filter_context(
        structured_context: dict[str, Any],
        context_mode: StrategyContextMode,
    ) -> dict[str, Any]:
        if context_mode in {
            StrategyContextMode.CASE_AWARE,
            StrategyContextMode.FULL,
        }:
            return structured_context

        if context_mode == StrategyContextMode.PROFILE_AWARE:
            return {
                "context_mode": structured_context["context_mode"],
                "profile": structured_context["profile"],
                "missing_profile_fields": structured_context["missing_profile_fields"],
                "critical_missing_information": structured_context[
                    "critical_missing_information"
                ],
                "helpful_missing_information": structured_context[
                    "helpful_missing_information"
                ],
                "grounding": structured_context["grounding"],
                "question": structured_context["question"],
            }

        return structured_context

    def _build_system_prompt(self, *, grounding_enabled: bool) -> str:
        instructions = [
            "You are an immigration strategy analysis assistant for Immigrant AI.",
            "Use only the supplied profile, case, and grounded knowledge context.",
            "This is decision support, not legal advice.",
            "Do not fabricate legal certainty, approvals, eligibility guarantees, or unavailable facts.",
            (
                "If grounded knowledge references are provided, use them as the factual "
                "anchor for procedural and policy-oriented statements."
            ),
            (
                "If grounded references are absent, stay at a strategic level and avoid "
                "unsupported procedural or policy detail."
            ),
            (
                "When grounded references conflict with assumptions, prefer the grounded "
                "references and the explicit structured context."
            ),
            (
                "If key profile or case fields are missing, explicitly say the guidance "
                "is provisional and keep confidence conservative."
            ),
            (
                "Treat the critical_missing_information list as the primary blocker list, "
                "and do not ignore it when ranking plans."
            ),
            (
                "Rank pathways from strongest to weakest based on fit, evidence strength, "
                "time horizon, cost level, and major execution risks."
            ),
            (
                "Prefer pathways already aligned with the stated destination country or "
                "target program when the supplied context supports them."
            ),
            (
                "Do not recommend filler alternatives just to reach three options. If "
                "fewer than 3 meaningful options are supported by the supplied context, "
                "return fewer plans."
            ),
            (
                "If the supplied context does not support a viable pathway ranking, return "
                "an empty plans array, explain the limitation in the summary, and use "
                "missing_information plus next_steps to state what is needed."
            ),
            (
                "Return JSON only with the exact keys: summary, plans, "
                "missing_information, next_steps, confidence_label."
            ),
            (
                "plans must be an array containing up to 3 meaningful options ordered "
                "from strongest to weakest."
            ),
            "Use labels Plan A, Plan B, and Plan C in sequence for the plans you return.",
            (
                "Each plan object must contain the exact keys: label, pathway_name, "
                "why_it_may_fit, major_risks, estimated_complexity, "
                "estimated_timeline_category, estimated_cost_category, "
                "suitability_score, next_action."
            ),
            (
                "summary should be a concise comparative explanation that highlights the "
                "best current route and why secondary options rank lower."
            ),
            (
                "why_it_may_fit should explain the pathway fit using only supplied facts, "
                "not unsupported assumptions."
            ),
            (
                "major_risks must list the main blockers, evidence gaps, or tradeoffs for "
                "that plan."
            ),
            (
                "missing_information must focus on the most decision-relevant unknowns, "
                "especially required profile data, case data, or evidence gaps."
            ),
            (
                "next_steps must be concrete, near-term actions the user can take to "
                "improve the strongest plan or reduce uncertainty."
            ),
            "major_risks, missing_information, and next_steps must be concise string arrays.",
            "Avoid duplicate items across missing_information and next_steps where possible.",
            "estimated_complexity must be one of: low, medium, high.",
            (
                "estimated_timeline_category must be one of: short_term, medium_term, "
                "long_term."
            ),
            "estimated_cost_category must be one of: low, medium, high.",
            (
                "suitability_score must be a 0 to 100 product suitability score, not a "
                "legal probability."
            ),
            (
                "confidence_label must be one of: low, medium, high, "
                "insufficient_information."
            ),
        ]

        if grounding_enabled:
            instructions.append(
                "Use grounded source names and excerpts only as support for factual claims."
            )

        return " ".join(instructions)

    def _build_user_prompt(
        self,
        *,
        filtered_context: dict[str, Any],
        question: str,
    ) -> str:
        sections = [
            "Analyze the following immigration strategy context and answer the user's question.",
            f"Context mode: {filtered_context['context_mode']}",
            f"Question: {question}",
        ]

        if "missing_profile_fields" in filtered_context:
            sections.append(
                self._format_missing_fields_line(
                    label="Known missing profile fields",
                    missing_fields=filtered_context["missing_profile_fields"],
                )
            )

        if "missing_case_fields" in filtered_context:
            sections.append(
                self._format_missing_fields_line(
                    label="Known missing case fields",
                    missing_fields=filtered_context["missing_case_fields"],
                )
            )

        if "critical_missing_information" in filtered_context:
            sections.append(
                self._format_missing_fields_line(
                    label="Critical missing information",
                    missing_fields=filtered_context["critical_missing_information"],
                )
            )

        if "helpful_missing_information" in filtered_context:
            sections.append(
                self._format_missing_fields_line(
                    label="Helpful missing information",
                    missing_fields=filtered_context["helpful_missing_information"],
                )
            )

        sections.append(
            self._build_grounding_summary(
                grounding=filtered_context["grounding"],
            )
        )
        sections.append(
            "Structured context JSON:\n"
            f"{json.dumps(filtered_context, ensure_ascii=True, indent=2)}"
        )

        return "\n\n".join(sections)

    @staticmethod
    def _format_missing_fields_line(
        *,
        label: str,
        missing_fields: Sequence[str],
    ) -> str:
        if not missing_fields:
            return f"{label}: none."

        return f"{label}: {', '.join(missing_fields)}."

    def _build_grounding_summary(self, *, grounding: dict[str, Any]) -> str:
        if not grounding["enabled"]:
            return (
                "Grounding references: none supplied. Keep procedural claims conservative "
                "and tied only to the structured context."
            )

        references = grounding["references"]
        lines = [
            (
                f"Grounding references: {len(references)} supplied via "
                f"{grounding['backend'] or 'unknown'} backend."
            )
        ]

        for index, reference in enumerate(references, start=1):
            descriptor_parts = [
                reference["source_name"],
                reference["authority_level"],
            ]

            if reference["country"]:
                descriptor_parts.append(reference["country"])

            if reference["visa_type"]:
                descriptor_parts.append(reference["visa_type"])

            lines.append(f"{index}. {' | '.join(descriptor_parts)}")

            if reference["match_reason"]:
                lines.append(f"   Match reason: {reference['match_reason']}")

            if reference["excerpt"]:
                lines.append(
                    "   Excerpt: "
                    f"{self._truncate_text(reference['excerpt'], self._grounding_excerpt_limit)}"
                )

        return "\n".join(lines)

    @staticmethod
    def _truncate_text(value: str, limit: int) -> str:
        if len(value) <= limit:
            return value

        return f"{value[: limit - 3].rstrip()}..."

    def _missing_profile_fields(self, profile_payload: dict[str, Any]) -> list[str]:
        missing_fields: list[str] = []

        for field_name, label in self._profile_field_labels.items():
            value = profile_payload.get(field_name)
            if value is None or (isinstance(value, str) and not value.strip()):
                missing_fields.append(label)

        return missing_fields

    def _missing_case_fields(self, case_payload: dict[str, Any]) -> list[str]:
        missing_fields: list[str] = []

        for field_name, label in self._case_field_labels.items():
            value = case_payload.get(field_name)
            if value is None or (isinstance(value, str) and not value.strip()):
                missing_fields.append(label)

        return missing_fields


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


class DocumentAnalysisPromptBuilder:
    """Build a strict JSON prompt for analyzing extracted document text."""

    def build(
        self,
        *,
        document_type: str,
        extracted_text: str,
    ) -> DocumentAnalysisPromptBundle:
        normalized_document_type = document_type.strip()
        normalized_extracted_text = extracted_text.strip()

        structured_context = {
            "document_type": normalized_document_type,
            "extracted_text": normalized_extracted_text,
        }

        system_prompt = (
            "You are an immigration document analysis engine. "
            "Analyze the uploaded document and extract practical insights. "
            "Do not give legal advice or claim certainty about authenticity. "
            "Use only the supplied document type and extracted text. "
            "Focus on likely document classification, visible information, extraction gaps, and practical improvements. "
            "Return STRICT JSON only with the exact keys: document_classification, key_information, issues_detected, missing_information, improvement_suggestions."
        )

        user_prompt = "\n".join(
            [
                "INPUT:",
                f"Document Type: {normalized_document_type}",
                f"Extracted Text: {normalized_extracted_text}",
                "",
                "OUTPUT:",
                "{",
                '  "document_classification": "...",',
                '  "key_information": ["..."],',
                '  "issues_detected": ["..."],',
                '  "missing_information": ["..."],',
                '  "improvement_suggestions": ["..."]',
                "}",
            ]
        )

        return DocumentAnalysisPromptBundle(
            structured_context=structured_context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )


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
