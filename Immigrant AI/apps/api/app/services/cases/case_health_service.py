from __future__ import annotations

from app.schemas.scoring import ImmigrationScoreRead
from app.schemas.workspace import (
    CaseHealthRead,
    CaseHealthStatus,
    DocumentChecklistSummaryRead,
)
from app.services.ai.missing_information_service import MissingInformationEvaluation
from app.services.ai.scoring_helpers import round_score


class CaseHealthService:
    """Evaluate a deterministic operational health signal for a case."""

    def evaluate(
        self,
        *,
        score: ImmigrationScoreRead,
        checklist_summary: DocumentChecklistSummaryRead,
        missing_information: MissingInformationEvaluation,
    ) -> CaseHealthRead:
        health_score = round_score(
            score.overall_score * 0.45
            + checklist_summary.readiness_score * 0.20
            + missing_information.profile_completeness_ratio * 0.20
            + missing_information.case_completeness_ratio * 0.15
        )

        critical_count = len(missing_information.critical_items)
        helpful_count = len(missing_information.helpful_items)
        health_score = max(
            0.0,
            round_score(
                health_score
                - critical_count * 6
                - checklist_summary.missing_required_items * 5
                - checklist_summary.failed_items * 7
                - min(helpful_count, 4) * 1.5
            ),
        )

        if critical_count >= 4 or checklist_summary.failed_items > 0 or health_score < 40:
            status = CaseHealthStatus.AT_RISK
        elif critical_count >= 2 or checklist_summary.missing_required_items >= 2 or health_score < 60:
            status = CaseHealthStatus.INCOMPLETE
        elif health_score < 80:
            status = CaseHealthStatus.NEEDS_ATTENTION
        else:
            status = CaseHealthStatus.STRONG

        issues = [
            *missing_information.critical_items[:4],
            *missing_information.helpful_items[:2],
        ]

        if checklist_summary.missing_required_items > 0:
            issues.append(
                f"{checklist_summary.missing_required_items} required checklist item"
                f"{'' if checklist_summary.missing_required_items == 1 else 's'} still need evidence."
            )
        if checklist_summary.failed_items > 0:
            issues.append(
                f"{checklist_summary.failed_items} uploaded document"
                f"{'' if checklist_summary.failed_items == 1 else 's'} failed processing."
            )

        recommended_next_focus = self._get_focus(
            critical_count=critical_count,
            checklist_summary=checklist_summary,
            health_status=status,
        )

        return CaseHealthRead(
            health_status=status,
            health_score=health_score,
            issues=issues[:8],
            recommended_next_focus=recommended_next_focus,
        )

    @staticmethod
    def _get_focus(
        *,
        critical_count: int,
        checklist_summary: DocumentChecklistSummaryRead,
        health_status: CaseHealthStatus,
    ) -> str:
        if critical_count > 0:
            return "Resolve the critical profile and case inputs that are still blocking reliable guidance."

        if checklist_summary.missing_required_items > 0:
            return "Close the required document gap so the case can move from planning into preparation."

        if checklist_summary.processing_items > 0:
            return "Review in-flight document processing results before moving to the next submission step."

        if health_status == CaseHealthStatus.STRONG:
            return "Keep the case moving by refining evidence quality and refreshing strategy when facts change."

        return "Tighten pathway clarity, documentation, and execution detail to improve case readiness."
