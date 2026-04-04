from __future__ import annotations

from datetime import datetime, timezone

from app.models.document import Document
from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.workspace import CaseWorkspaceRead, MissingInformationGroupRead
from app.services.action_roadmap_service import ActionRoadmapService
from app.services.case_health_service import CaseHealthService
from app.services.document_checklist_service import DocumentChecklistService
from app.services.missing_information_service import MissingInformationService
from app.services.next_best_action_service import NextBestActionService
from app.services.scoring_service import ScoringService


class CaseWorkspaceService:
    """Assemble deterministic operational workspace data for a case."""

    def __init__(
        self,
        *,
        checklist_service: DocumentChecklistService | None = None,
        health_service: CaseHealthService | None = None,
        missing_information_service: MissingInformationService | None = None,
        next_best_action_service: NextBestActionService | None = None,
        roadmap_service: ActionRoadmapService | None = None,
        scoring_service: ScoringService | None = None,
    ) -> None:
        self._checklist_service = checklist_service or DocumentChecklistService()
        self._health_service = health_service or CaseHealthService()
        self._missing_information_service = (
            missing_information_service or MissingInformationService()
        )
        self._next_best_action_service = (
            next_best_action_service or NextBestActionService()
        )
        self._roadmap_service = roadmap_service or ActionRoadmapService()
        self._scoring_service = scoring_service or ScoringService()

    def build(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        documents: list[Document],
    ) -> CaseWorkspaceRead:
        missing_information = self._missing_information_service.evaluate(
            profile=profile,
            immigration_case=immigration_case,
        )
        score = self._scoring_service.score_case(
            profile=profile,
            immigration_case=immigration_case,
        )
        checklist, checklist_summary = self._checklist_service.build(
            profile=profile,
            immigration_case=immigration_case,
            documents=documents,
        )
        health = self._health_service.evaluate(
            score=score,
            checklist_summary=checklist_summary,
            missing_information=missing_information,
        )
        roadmap = self._roadmap_service.build(
            profile=profile,
            immigration_case=immigration_case,
            checklist=checklist,
            missing_information=missing_information,
        )
        next_best_action = self._next_best_action_service.recommend(
            roadmap=roadmap,
            recommended_focus=health.recommended_next_focus,
        )

        return CaseWorkspaceRead(
            case_id=immigration_case.id,
            generated_at=datetime.now(timezone.utc),
            health=health,
            next_best_action=next_best_action,
            missing_information=MissingInformationGroupRead(
                critical=missing_information.critical_items,
                helpful=missing_information.helpful_items,
            ),
            checklist_summary=checklist_summary,
            checklist=checklist,
            roadmap=roadmap,
        )
