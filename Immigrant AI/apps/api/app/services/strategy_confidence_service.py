from __future__ import annotations

from dataclasses import dataclass

from app.schemas.ai import ConfidenceLabel
from app.services.missing_information_service import MissingInformationEvaluation
from app.services.scoring_helpers import round_score


@dataclass(frozen=True)
class StrategyConfidenceEvaluation:
    confidence_score: float
    confidence_label: ConfidenceLabel
    confidence_reasons: list[str]


class StrategyConfidenceService:
    """Produce a deterministic confidence signal for strategy responses."""

    def evaluate(
        self,
        *,
        missing_information: MissingInformationEvaluation,
        grounding_used: bool,
        plan_count: int,
        normalization_issue_count: int,
    ) -> StrategyConfidenceEvaluation:
        score = 20.0
        reasons: list[str] = []

        profile_ratio = missing_information.profile_completeness_ratio
        case_ratio = missing_information.case_completeness_ratio
        critical_count = len(missing_information.critical_items)
        helpful_count = len(missing_information.helpful_items)

        score += profile_ratio * 0.3
        score += case_ratio * 0.25

        if grounding_used:
            score += 10
            reasons.append(
                "Grounded knowledge sources were used to anchor procedural context."
            )
        else:
            reasons.append(
                "No grounded knowledge sources were available for this pass."
            )

        if plan_count > 0:
            score += min(plan_count * 4, 12)
            reasons.append(
                f"{plan_count} structured plan{'s' if plan_count != 1 else ''} passed response validation."
            )
        else:
            score -= 20
            reasons.append(
                "No meaningful plans were produced from the current data state."
            )

        if normalization_issue_count == 0:
            score += 5
            reasons.append("Structured output passed backend normalization checks cleanly.")
        else:
            score -= min(normalization_issue_count * 6, 18)
            reasons.append(
                "Backend normalization had to repair or discard part of the model output."
            )

        if critical_count > 0:
            score -= min(critical_count * 10, 40)
            reasons.append(
                f"{critical_count} critical information gap{'s' if critical_count != 1 else ''} materially limit strategy certainty."
            )
        if helpful_count > 0:
            score -= min(helpful_count * 2, 12)
            reasons.append(
                f"{helpful_count} helpful information gap{'s' if helpful_count != 1 else ''} still reduce precision."
            )

        reasons.append(
            f"Profile completeness is {profile_ratio:.0f}% across the core strategy fields."
        )
        reasons.append(
            f"Case readiness is {case_ratio:.0f}% across the core case-definition fields."
        )

        confidence_score = round_score(score)

        if critical_count >= 5 or (plan_count == 0 and confidence_score < 35):
            confidence_label = ConfidenceLabel.INSUFFICIENT_INFORMATION
        elif confidence_score < 45:
            confidence_label = ConfidenceLabel.LOW
        elif confidence_score < 75:
            confidence_label = ConfidenceLabel.MEDIUM
        else:
            confidence_label = ConfidenceLabel.HIGH

        return StrategyConfidenceEvaluation(
            confidence_score=confidence_score,
            confidence_label=confidence_label,
            confidence_reasons=reasons[:6],
        )
