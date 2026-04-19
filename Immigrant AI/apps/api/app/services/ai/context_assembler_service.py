from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.immigration_case import ImmigrationCase
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.scoring import ImmigrationScoreRead
from app.schemas.user_profile import UserProfileRead
from app.services.ai.action_roadmap_service import ActionRoadmapService
from app.services.cases.case_service import CaseService
from app.services.documents.document_checklist_service import DocumentChecklistService
from app.services.documents.document_service import DocumentService
from app.services.ai.missing_information_service import MissingInformationService
from app.services.ai.next_best_action_service import NextBestActionService
from app.services.profile.profile_service import ProfileService
from app.services.ai.scoring_service import ScoringService


@dataclass(frozen=True)
class CopilotContextSnapshot:
    profile_summary: dict[str, Any]
    case_summary: dict[str, Any]
    score_summary: dict[str, Any]
    missing_information: dict[str, list[str]]
    recent_documents_summary: dict[str, Any]
    previous_ai_strategy: dict[str, Any]
    next_best_action: dict[str, Any]

    def to_prompt_payload(self) -> dict[str, Any]:
        return {
            "profile_summary": self.profile_summary,
            "case_summary": self.case_summary,
            "score_summary": self.score_summary,
            "missing_information": self.missing_information,
            "recent_documents_summary": self.recent_documents_summary,
            "previous_ai_strategy": self.previous_ai_strategy,
            "next_best_action": self.next_best_action,
        }


class ContextAssemblerService:
    """Assemble deterministic case context for copilot turns."""

    def __init__(
        self,
        *,
        action_roadmap_service: ActionRoadmapService | None = None,
        case_service: CaseService | None = None,
        checklist_service: DocumentChecklistService | None = None,
        document_service: DocumentService,
        missing_information_service: MissingInformationService | None = None,
        next_best_action_service: NextBestActionService | None = None,
        profile_service: ProfileService | None = None,
        scoring_service: ScoringService | None = None,
    ) -> None:
        self._action_roadmap_service = action_roadmap_service or ActionRoadmapService()
        self._case_service = case_service or CaseService()
        self._checklist_service = checklist_service or DocumentChecklistService()
        self._document_service = document_service
        self._missing_information_service = (
            missing_information_service or MissingInformationService()
        )
        self._next_best_action_service = (
            next_best_action_service or NextBestActionService()
        )
        self._profile_service = profile_service or ProfileService()
        self._scoring_service = scoring_service or ScoringService()

    async def assemble(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
    ) -> CopilotContextSnapshot:
        immigration_case = await self._case_service.get_case(session, user, case_id)
        profile = await self._profile_service.get_or_create_profile(session, user)
        documents = await self._document_service.list_case_documents(
            session=session,
            user=user,
            case_id=case_id,
        )
        return self._build_snapshot(
            profile=profile,
            immigration_case=immigration_case,
            documents=documents,
        )

    def _build_snapshot(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        documents: list[Document],
    ) -> CopilotContextSnapshot:
        score = self._scoring_service.score_case(
            profile=profile,
            immigration_case=immigration_case,
        )
        missing_information = self._missing_information_service.evaluate(
            profile=profile,
            immigration_case=immigration_case,
        )
        checklist, checklist_summary = self._checklist_service.build(
            profile=profile,
            immigration_case=immigration_case,
            documents=documents,
        )
        roadmap = self._action_roadmap_service.build(
            profile=profile,
            immigration_case=immigration_case,
            checklist=checklist,
            missing_information=missing_information,
        )
        next_best_action = self._next_best_action_service.recommend(
            roadmap=roadmap,
            recommended_focus=(
                "Focus on the highest-impact blocker in the current case state."
            ),
        )

        return CopilotContextSnapshot(
            profile_summary=UserProfileRead.model_validate(profile).model_dump(mode="json"),
            case_summary=ImmigrationCaseRead.model_validate(immigration_case).model_dump(
                mode="json"
            ),
            score_summary=self._score_summary(score),
            missing_information={
                "critical": list(missing_information.critical_items),
                "helpful": list(missing_information.helpful_items),
            },
            recent_documents_summary=self._recent_documents_summary(
                documents=documents,
                checklist_readiness=checklist_summary.readiness_score,
                missing_required_items=checklist_summary.missing_required_items,
            ),
            previous_ai_strategy=self._previous_ai_strategy_summary(immigration_case),
            next_best_action=next_best_action.model_dump(mode="json"),
        )

    @staticmethod
    def _score_summary(score: ImmigrationScoreRead) -> dict[str, Any]:
        return {
            "overall_score": score.overall_score,
            "overall_reasons": list(score.overall_reasons),
            "profile_completeness": score.profile_completeness.score,
            "financial_readiness": score.financial_readiness.score,
            "professional_strength": score.professional_strength.score,
            "case_readiness": score.case_readiness.score,
        }

    @staticmethod
    def _recent_documents_summary(
        *,
        documents: list[Document],
        checklist_readiness: float,
        missing_required_items: int,
    ) -> dict[str, Any]:
        return {
            "total_documents": len(documents),
            "checklist_readiness_score": checklist_readiness,
            "missing_required_items": missing_required_items,
            "recent_documents": [
                {
                    "id": str(document.id),
                    "original_filename": document.original_filename,
                    "document_type": document.document_type,
                    "upload_status": document.upload_status.value,
                    "created_at": document.created_at.isoformat(),
                }
                for document in documents[:5]
            ],
        }

    @staticmethod
    def _previous_ai_strategy_summary(
        immigration_case: ImmigrationCase,
    ) -> dict[str, Any]:
        return {
            "available": False,
            "summary": None,
            "note": (
                "No persisted AI strategy snapshot is currently stored for this case."
            ),
            "target_program": immigration_case.target_program,
        }
