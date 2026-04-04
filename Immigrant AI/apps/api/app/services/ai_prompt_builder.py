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
