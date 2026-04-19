from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Iterable

from app.schemas.ai import AIStrategyModelOutput, ConfidenceLabel, StrategyPlan, StrategyPlanLabel

logger = logging.getLogger("immigrant-ai-api.ai_response_normalizer")


@dataclass(frozen=True)
class AIStrategyNormalizationResult:
    output: AIStrategyModelOutput
    issues: list[str]

    @property
    def normalization_applied(self) -> bool:
        return bool(self.issues)


class AIStrategyResponseNormalizer:
    """Normalize and defensively sanitize structured AI strategy responses."""

    _fallback_next_step = (
        "Complete the highest-priority missing information before requesting another strategy pass."
    )

    def normalize(
        self,
        *,
        case_id: str,
        output: AIStrategyModelOutput,
        fallback_missing_information: Iterable[str],
    ) -> AIStrategyNormalizationResult:
        issues: list[str] = []
        fallback_missing = self._clean_string_list(fallback_missing_information)

        normalized_plans: list[StrategyPlan] = []
        expected_labels = [
            StrategyPlanLabel.PLAN_A,
            StrategyPlanLabel.PLAN_B,
            StrategyPlanLabel.PLAN_C,
        ]

        for index, plan in enumerate(output.plans[:3]):
            pathway_name = self._clean_text(plan.pathway_name)
            why_it_may_fit = self._clean_text(plan.why_it_may_fit)
            next_action = self._clean_text(plan.next_action)

            if not pathway_name or not why_it_may_fit:
                issues.append(f"dropped_plan_{index + 1}_missing_required_text")
                continue

            if not next_action:
                next_action = self._fallback_next_step
                issues.append(f"repaired_plan_{index + 1}_next_action")

            major_risks = self._clean_string_list(plan.major_risks)
            if plan.label != expected_labels[len(normalized_plans)]:
                issues.append(f"relabelled_plan_{index + 1}")

            normalized_plans.append(
                StrategyPlan(
                    label=expected_labels[len(normalized_plans)],
                    pathway_name=pathway_name,
                    why_it_may_fit=why_it_may_fit,
                    major_risks=major_risks[:5],
                    estimated_complexity=plan.estimated_complexity,
                    estimated_timeline_category=plan.estimated_timeline_category,
                    estimated_cost_category=plan.estimated_cost_category,
                    suitability_score=round(max(0.0, min(100.0, float(plan.suitability_score))), 1),
                    next_action=next_action,
                )
            )

        missing_information = self._clean_string_list(
            [*output.missing_information, *fallback_missing]
        )[:10]
        next_steps = self._clean_string_list(output.next_steps)[:10]

        summary = self._clean_text(output.summary)
        if not summary:
            summary = self._build_fallback_summary(normalized_plans, missing_information)
            issues.append("repaired_summary")

        if not next_steps:
            next_steps = [self._fallback_next_step]
            issues.append("repaired_next_steps")

        normalized_output = AIStrategyModelOutput(
            summary=summary,
            plans=normalized_plans,
            missing_information=missing_information,
            next_steps=next_steps,
            confidence_label=output.confidence_label or ConfidenceLabel.LOW,
        )

        if issues:
            logger.warning(
                "ai.strategy_normalization_applied",
                extra={"case_id": case_id, "issues": issues},
            )

        return AIStrategyNormalizationResult(
            output=normalized_output,
            issues=issues,
        )

    @staticmethod
    def _clean_text(value: str | None) -> str:
        if value is None:
            return ""
        return " ".join(value.split()).strip()

    def _clean_string_list(self, values: Iterable[str]) -> list[str]:
        seen: set[str] = set()
        cleaned: list[str] = []

        for value in values:
            normalized = self._clean_text(value)
            if not normalized:
                continue
            lowercase = normalized.casefold()
            if lowercase in seen:
                continue
            seen.add(lowercase)
            cleaned.append(normalized)

        return cleaned

    def _build_fallback_summary(
        self,
        plans: list[StrategyPlan],
        missing_information: list[str],
    ) -> str:
        if plans:
            return (
                f"{plans[0].pathway_name} currently appears to be the strongest structured option, "
                "but the result should be treated as provisional until missing information is resolved."
            )

        if missing_information:
            return (
                "The current strategy pass is provisional because essential information is still missing."
            )

        return "No reliable strategy comparison could be produced from the current inputs."
