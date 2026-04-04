from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.immigration_case import ImmigrationCase
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.probability import PathwayProbabilityRead
from app.schemas.scoring import ImmigrationScoreRead
from app.schemas.timeline import CaseTimelineRead
from app.schemas.workspace import (
    CaseHealthRead,
    CaseWorkspaceRead,
    DocumentChecklistSummaryRead,
    DocumentStatusSummaryRead,
    MissingInformationGroupRead,
    MissingInformationItemRead,
    MissingInformationSeverity,
    ProbabilitySummaryRead,
    ReadinessScoreSummaryRead,
    RecommendedPathwayRead,
    RiskSeverity,
    RiskSource,
    TimelineSummaryRead,
    WorkspaceRiskRead,
)
from app.services.action_roadmap_service import ActionRoadmapService
from app.services.case_health_service import CaseHealthService
from app.services.case_service import CaseService
from app.services.document_checklist_service import DocumentChecklistService
from app.services.document_service import DocumentService
from app.services.missing_information_service import MissingInformationService
from app.services.next_best_action_service import NextBestActionService
from app.services.pathway_probability_service import PathwayProbabilityService
from app.services.profile_service import ProfileService
from app.services.scoring_service import ScoringService
from app.services.timeline_simulation_service import TimelineSimulationService


class CaseWorkspaceService:
    """Assemble deterministic operational workspace data for a case."""

    def __init__(
        self,
        *,
        case_service: CaseService | None = None,
        checklist_service: DocumentChecklistService | None = None,
        document_service: DocumentService | None = None,
        health_service: CaseHealthService | None = None,
        missing_information_service: MissingInformationService | None = None,
        next_best_action_service: NextBestActionService | None = None,
        pathway_probability_service: PathwayProbabilityService | None = None,
        profile_service: ProfileService | None = None,
        roadmap_service: ActionRoadmapService | None = None,
        scoring_service: ScoringService | None = None,
        timeline_simulation_service: TimelineSimulationService | None = None,
    ) -> None:
        self._case_service = case_service or CaseService()
        self._checklist_service = checklist_service or DocumentChecklistService()
        self._document_service = document_service
        self._health_service = health_service or CaseHealthService()
        self._missing_information_service = (
            missing_information_service or MissingInformationService()
        )
        self._next_best_action_service = (
            next_best_action_service or NextBestActionService()
        )
        self._pathway_probability_service = pathway_probability_service
        self._profile_service = profile_service or ProfileService()
        self._roadmap_service = roadmap_service or ActionRoadmapService()
        self._scoring_service = scoring_service or ScoringService()
        self._timeline_simulation_service = timeline_simulation_service

    async def build_case_workspace(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
    ) -> CaseWorkspaceRead:
        if self._document_service is None:
            raise RuntimeError("DocumentService dependency is required for workspace aggregation.")
        if self._pathway_probability_service is None:
            raise RuntimeError(
                "PathwayProbabilityService dependency is required for workspace aggregation."
            )
        if self._timeline_simulation_service is None:
            raise RuntimeError(
                "TimelineSimulationService dependency is required for workspace aggregation."
            )

        immigration_case = await self._case_service.get_case(session, user, case_id)
        profile = await self._profile_service.get_or_create_profile(session, user)
        documents = await self._document_service.list_case_documents(
            session=session,
            user=user,
            case_id=immigration_case.id,
        )
        score = self._scoring_service.score_case(
            profile=profile,
            immigration_case=immigration_case,
        )
        probability = await self._pathway_probability_service.evaluate_case(
            session=session,
            user=user,
            case_id=immigration_case.id,
        )
        timeline = await self._timeline_simulation_service.simulate_case(
            session=session,
            user=user,
            case_id=immigration_case.id,
        )
        return self.build(
            profile=profile,
            immigration_case=immigration_case,
            documents=documents,
            score=score,
            probability=probability,
            timeline=timeline,
        )

    def build(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        documents: list[Document],
        probability: PathwayProbabilityRead | None = None,
        score: ImmigrationScoreRead | None = None,
        timeline: CaseTimelineRead | None = None,
    ) -> CaseWorkspaceRead:
        missing_information = self._missing_information_service.evaluate(
            profile=profile,
            immigration_case=immigration_case,
        )
        score = score or self._scoring_service.score_case(
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
        probability = probability or self._build_fallback_probability(
            immigration_case=immigration_case,
            missing_information=missing_information,
            score=score,
        )
        timeline = timeline or self._build_fallback_timeline(immigration_case=immigration_case)
        missing_information_grouped = MissingInformationGroupRead(
            critical=missing_information.critical_items,
            helpful=missing_information.helpful_items,
        )
        missing_information_items = self._flatten_missing_information(
            missing_information=missing_information
        )
        document_status_summary = self._build_document_status_summary(
            checklist_summary=checklist_summary
        )
        readiness_score = self._build_readiness_score_summary(score=score)
        probability_summary = self._build_probability_summary(probability=probability)
        timeline_summary = self._build_timeline_summary(timeline=timeline)
        top_risks = self._build_top_risks(
            checklist_summary=checklist_summary,
            health=health,
            probability=probability,
            timeline=timeline,
        )
        recommended_pathway = self._build_recommended_pathway(probability=probability)

        return CaseWorkspaceRead(
            case_id=immigration_case.id,
            generated_at=datetime.now(timezone.utc),
            readiness_score=readiness_score,
            probability_summary=probability_summary,
            timeline_summary=timeline_summary,
            top_risks=top_risks,
            missing_information=missing_information_items,
            health=health,
            case_health=health,
            next_best_action=next_best_action,
            missing_information_grouped=missing_information_grouped,
            document_status_summary=document_status_summary,
            recommended_pathway=recommended_pathway,
            checklist_summary=checklist_summary,
            checklist=checklist,
            roadmap=roadmap,
            action_roadmap=roadmap,
        )

    @staticmethod
    def _build_readiness_score_summary(
        *,
        score: ImmigrationScoreRead,
    ) -> ReadinessScoreSummaryRead:
        overall = score.overall_score
        if overall >= 80:
            label = "Strong"
        elif overall >= 65:
            label = "On track"
        elif overall >= 45:
            label = "Needs strengthening"
        else:
            label = "Early stage"

        summary = score.overall_reasons[0] if score.overall_reasons else (
            "Readiness is being assembled from profile completeness, financial signals, professional strength, and case readiness."
        )

        return ReadinessScoreSummaryRead(
            overall_score=overall,
            label=label,
            summary=summary,
            profile_completeness_score=score.profile_completeness.score,
            financial_readiness_score=score.financial_readiness.score,
            professional_strength_score=score.professional_strength.score,
            case_readiness_score=score.case_readiness.score,
        )

    @staticmethod
    def _build_probability_summary(
        *,
        probability: PathwayProbabilityRead,
    ) -> ProbabilitySummaryRead:
        return ProbabilitySummaryRead(
            probability_score=probability.probability_score,
            confidence_level=probability.confidence_level,
            summary=probability.reasoning_summary,
            strengths=probability.strengths[:3],
            weaknesses=probability.weaknesses[:3],
        )

    @staticmethod
    def _build_timeline_summary(
        *,
        timeline: CaseTimelineRead,
    ) -> TimelineSummaryRead:
        first_step = timeline.steps[0] if timeline.steps else None
        return TimelineSummaryRead(
            total_estimated_duration_months=timeline.total_estimated_duration_months,
            next_step=first_step.step_name if first_step else None,
            next_step_duration_months=(
                first_step.estimated_duration_months if first_step else None
            ),
            delay_risks=timeline.delay_risks[:4],
            acceleration_tips=timeline.acceleration_tips[:4],
        )

    @staticmethod
    def _flatten_missing_information(
        *,
        missing_information,
    ) -> list[MissingInformationItemRead]:
        items: list[MissingInformationItemRead] = []

        for index, message in enumerate(missing_information.critical_items, start=1):
            items.append(
                MissingInformationItemRead(
                    id=f"critical_{index}",
                    severity=MissingInformationSeverity.CRITICAL,
                    source="profile_or_case",
                    message=message,
                )
            )

        for index, message in enumerate(missing_information.helpful_items, start=1):
            items.append(
                MissingInformationItemRead(
                    id=f"helpful_{index}",
                    severity=MissingInformationSeverity.HELPFUL,
                    source="profile_or_case",
                    message=message,
                )
            )

        return items

    @staticmethod
    def _build_document_status_summary(
        *,
        checklist_summary: DocumentChecklistSummaryRead,
    ) -> DocumentStatusSummaryRead:
        if checklist_summary.failed_items > 0:
            summary = (
                f"{checklist_summary.failed_items} uploaded document"
                f"{'' if checklist_summary.failed_items == 1 else 's'} need attention."
            )
        elif checklist_summary.missing_required_items > 0:
            summary = (
                f"{checklist_summary.missing_required_items} required document item"
                f"{'' if checklist_summary.missing_required_items == 1 else 's'} still need coverage."
            )
        elif checklist_summary.processing_items > 0:
            summary = (
                f"{checklist_summary.processing_items} document"
                f"{'' if checklist_summary.processing_items == 1 else 's'} are still processing."
            )
        else:
            summary = "Required evidence coverage is in a comparatively healthy state."

        return DocumentStatusSummaryRead(
            **checklist_summary.model_dump(),
            attention_required=(
                checklist_summary.failed_items > 0
                or checklist_summary.missing_required_items > 0
            ),
            summary=summary,
        )

    @staticmethod
    def _build_recommended_pathway(
        *,
        probability: PathwayProbabilityRead,
    ) -> RecommendedPathwayRead:
        return RecommendedPathwayRead(
            target_country=probability.target_country,
            pathway=probability.target_program,
            confidence_level=probability.confidence_level,
            rationale=probability.reasoning_summary,
        )

    @staticmethod
    def _build_top_risks(
        *,
        checklist_summary: DocumentChecklistSummaryRead,
        health: CaseHealthRead,
        probability: PathwayProbabilityRead,
        timeline: CaseTimelineRead,
    ) -> list[WorkspaceRiskRead]:
        items: list[WorkspaceRiskRead] = []

        for index, risk in enumerate(probability.key_risk_factors[:2], start=1):
            items.append(
                WorkspaceRiskRead(
                    id=f"probability_{index}",
                    title="Pathway confidence risk",
                    severity=RiskSeverity.HIGH,
                    source=RiskSource.PROBABILITY,
                    description=risk,
                )
            )

        for index, risk in enumerate(timeline.delay_risks[:1], start=1):
            items.append(
                WorkspaceRiskRead(
                    id=f"timeline_{index}",
                    title="Timeline delay risk",
                    severity=RiskSeverity.MEDIUM,
                    source=RiskSource.TIMELINE,
                    description=risk,
                )
            )

        if checklist_summary.failed_items > 0 or checklist_summary.missing_required_items > 0:
            items.append(
                WorkspaceRiskRead(
                    id="documents_1",
                    title="Document coverage risk",
                    severity=(
                        RiskSeverity.HIGH
                        if checklist_summary.failed_items > 0
                        else RiskSeverity.MEDIUM
                    ),
                    source=RiskSource.DOCUMENTS,
                    description=(
                        f"Required evidence coverage is incomplete or blocked by failed uploads. "
                        f"{checklist_summary.missing_required_items} required item"
                        f"{'' if checklist_summary.missing_required_items == 1 else 's'} are still uncovered."
                    ),
                )
            )

        for index, issue in enumerate(health.issues[:1], start=1):
            items.append(
                WorkspaceRiskRead(
                    id=f"health_{index}",
                    title="Operational health risk",
                    severity=RiskSeverity.MEDIUM,
                    source=RiskSource.HEALTH,
                    description=issue,
                )
            )

        deduped: list[WorkspaceRiskRead] = []
        seen_descriptions: set[str] = set()
        for item in items:
            if item.description in seen_descriptions:
                continue
            seen_descriptions.add(item.description)
            deduped.append(item)

        return deduped[:5]

    @staticmethod
    def _build_fallback_probability(
        *,
        immigration_case: ImmigrationCase,
        missing_information,
        score: ImmigrationScoreRead,
    ) -> PathwayProbabilityRead:
        from app.models.enums import PathwayProbabilityConfidenceLevel

        confidence = (
            PathwayProbabilityConfidenceLevel.HIGH
            if score.overall_score >= 80 and not missing_information.critical_items
            else PathwayProbabilityConfidenceLevel.MEDIUM
            if score.overall_score >= 55
            else PathwayProbabilityConfidenceLevel.LOW
        )
        return PathwayProbabilityRead(
            case_id=immigration_case.id,
            target_country=immigration_case.target_country,
            target_program=immigration_case.target_program,
            disclaimer="This is a deterministic product probability estimate for planning support. It is not legal advice or an approval guarantee.",
            probability_score=score.overall_score,
            confidence_level=confidence,
            strengths=[],
            weaknesses=[],
            key_risk_factors=missing_information.critical_items[:3],
            improvement_actions=missing_information.helpful_items[:3],
            reasoning_summary="A workspace probability snapshot is being estimated from the deterministic score and current information quality.",
            generated_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def _build_fallback_timeline(
        *,
        immigration_case: ImmigrationCase,
    ) -> CaseTimelineRead:
        return CaseTimelineRead(
            case_id=immigration_case.id,
            target_country=immigration_case.target_country,
            target_program=immigration_case.target_program,
            disclaimer="This is a deterministic planning timeline estimate. It supports preparation decisions and does not guarantee government processing times.",
            total_estimated_duration_months=0,
            steps=[],
            delay_risks=[],
            acceleration_tips=[],
            generated_at=datetime.now(timezone.utc),
        )
