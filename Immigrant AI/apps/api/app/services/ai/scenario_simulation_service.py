from __future__ import annotations

from datetime import datetime, timezone

from app.models.enums import EducationLevel, EnglishLevel
from app.models.immigration_case import ImmigrationCase
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.probability import PathwayProbabilityRead
from app.schemas.scoring import ImmigrationScoreRead
from app.schemas.simulation import (
    CaseSimulationDelta,
    CaseSimulationImpactItem,
    CaseSimulationRecommendation,
    CaseSimulationRequest,
    CaseSimulationResponse,
    CaseSimulationSnapshot,
)
from app.schemas.timeline import CaseTimelineRead
from app.services.cases.case_service import CaseService
from app.services.ai.pathway_probability_service import PathwayProbabilityService
from app.services.profile.profile_service import ProfileService
from app.services.ai.scoring_service import ScoringService
from app.services.ai.timeline_simulation_service import TimelineSimulationService
from sqlalchemy.ext.asyncio import AsyncSession


class ScenarioSimulationService:
    """Deterministic scenario simulation for case planning."""

    def __init__(
        self,
        *,
        case_service: CaseService,
        profile_service: ProfileService,
        scoring_service: ScoringService,
        pathway_probability_service: PathwayProbabilityService,
        timeline_simulation_service: TimelineSimulationService,
    ) -> None:
        self._case_service = case_service
        self._profile_service = profile_service
        self._scoring_service = scoring_service
        self._pathway_probability_service = pathway_probability_service
        self._timeline_simulation_service = timeline_simulation_service

    def _round_delta(self, value: float) -> float:
        return round(value, 1)

    async def simulate_case(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id,
        payload: CaseSimulationRequest,
    ) -> CaseSimulationResponse:
        immigration_case = await self._case_service.get_case(session, user, case_id)
        profile = await self._profile_service.get_or_create_profile(session, user)

        current_score = self._scoring_service.score_case(
            profile=profile,
            immigration_case=immigration_case,
        )
        current_probability = self._pathway_probability_service.evaluate_option(
            profile=profile,
            immigration_case=immigration_case,
        )
        current_timeline = self._timeline_simulation_service.build_timeline(
            profile=profile,
            immigration_case=immigration_case,
        )

        simulated_profile = self._clone_profile(profile)
        simulated_case = self._clone_case(immigration_case)
        self._apply_profile_overrides(simulated_profile, payload)
        self._apply_case_overrides(simulated_case, payload)

        simulated_score = self._scoring_service.score_case(
            profile=simulated_profile,
            immigration_case=simulated_case,
        )
        simulated_probability = self._pathway_probability_service.evaluate_option(
            profile=simulated_profile,
            immigration_case=simulated_case,
        )
        simulated_timeline = self._timeline_simulation_service.build_timeline(
            profile=simulated_profile,
            immigration_case=simulated_case,
        )

        delta = CaseSimulationDelta(
            readiness_score_change=self._round_delta(
                simulated_score.overall_score - current_score.overall_score
            ),
            probability_score_change=self._round_delta(
                simulated_probability.probability_score
                - current_probability.probability_score
            ),
            timeline_months_change=self._round_delta(
                simulated_timeline.total_estimated_duration_months
                - current_timeline.total_estimated_duration_months
            ),
        )

        return CaseSimulationResponse(
            case_id=immigration_case.id,
            disclaimer=(
                "This is a planning simulation for product guidance. "
                "It is not legal advice or an approval guarantee."
            ),
            current=self._build_snapshot(
                score=current_score,
                probability=current_probability,
                timeline=current_timeline,
                stronger=False,
            ),
            simulated=self._build_snapshot(
                score=simulated_score,
                probability=simulated_probability,
                timeline=simulated_timeline,
                stronger=simulated_probability.probability_score
                >= current_probability.probability_score,
            ),
            delta=delta,
            impact_summary=self._build_impact_summary(
                current_profile=profile,
                current_case=immigration_case,
                simulated_profile=simulated_profile,
                simulated_case=simulated_case,
                delta=delta,
            ),
            recommended_improvements=self._build_recommendations(
                simulated_profile=simulated_profile,
                simulated_case=simulated_case,
            ),
            generated_at=datetime.now(timezone.utc),
        )

    def _clone_profile(self, profile: UserProfile) -> UserProfile:
        return UserProfile(
            id=profile.id,
            user_id=profile.user_id,
            first_name=profile.first_name,
            last_name=profile.last_name,
            nationality=profile.nationality,
            current_country=profile.current_country,
            target_country=profile.target_country,
            marital_status=profile.marital_status,
            children_count=profile.children_count,
            education_level=profile.education_level,
            english_level=profile.english_level,
            profession=profile.profession,
            years_of_experience=profile.years_of_experience,
            available_capital=profile.available_capital,
            criminal_record_flag=profile.criminal_record_flag,
            prior_visa_refusal_flag=profile.prior_visa_refusal_flag,
            relocation_timeline=profile.relocation_timeline,
            preferred_language=profile.preferred_language,
        )

    def _clone_case(self, immigration_case: ImmigrationCase) -> ImmigrationCase:
        return ImmigrationCase(
            id=immigration_case.id,
            user_id=immigration_case.user_id,
            title=immigration_case.title,
            target_country=immigration_case.target_country,
            target_program=immigration_case.target_program,
            current_stage=immigration_case.current_stage,
            status=immigration_case.status,
            notes=immigration_case.notes,
            latest_score=immigration_case.latest_score,
            risk_score=immigration_case.risk_score,
        )

    def _apply_profile_overrides(
        self,
        profile: UserProfile,
        payload: CaseSimulationRequest,
    ) -> None:
        overrides = payload.profile_overrides
        if overrides.education_level is not None:
            profile.education_level = overrides.education_level
        if overrides.english_level is not None:
            profile.english_level = overrides.english_level
        if overrides.available_capital is not None:
            profile.available_capital = overrides.available_capital
        if overrides.years_of_experience is not None:
            profile.years_of_experience = overrides.years_of_experience
        if overrides.target_country is not None:
            profile.target_country = overrides.target_country

    def _apply_case_overrides(
        self,
        immigration_case: ImmigrationCase,
        payload: CaseSimulationRequest,
    ) -> None:
        overrides = payload.case_overrides
        if overrides.target_country is not None:
            immigration_case.target_country = overrides.target_country
        if overrides.target_program is not None:
            immigration_case.target_program = overrides.target_program

    def _build_snapshot(
        self,
        *,
        score: ImmigrationScoreRead,
        probability: PathwayProbabilityRead,
        timeline: CaseTimelineRead,
        stronger: bool,
    ) -> CaseSimulationSnapshot:
        return CaseSimulationSnapshot(
            readiness_score=score.overall_score,
            probability_score=probability.probability_score,
            timeline_months=timeline.total_estimated_duration_months,
            confidence_level=probability.confidence_level,
            summary=(
                "The simulated profile creates a stronger planning position with a shorter and more reliable preparation path."
                if stronger
                else "The current profile remains directionally viable, but confidence and execution speed are still constrained by a few inputs."
            ),
        )

    def _build_impact_summary(
        self,
        *,
        current_profile: UserProfile,
        current_case: ImmigrationCase,
        simulated_profile: UserProfile,
        simulated_case: ImmigrationCase,
        delta: CaseSimulationDelta,
    ) -> list[CaseSimulationImpactItem]:
        items: list[CaseSimulationImpactItem] = []

        if delta.probability_score_change >= 8:
            items.append(
                CaseSimulationImpactItem(
                    id="probability-up",
                    summary="This scenario materially improves the likely competitiveness of the current pathway.",
                    tone="positive",
                )
            )
        elif delta.probability_score_change <= -8:
            items.append(
                CaseSimulationImpactItem(
                    id="probability-down",
                    summary="This scenario weakens the pathway outlook and would likely make the case harder to execute well.",
                    tone="negative",
                )
            )
        else:
            items.append(
                CaseSimulationImpactItem(
                    id="probability-flat",
                    summary="This scenario changes the pathway outlook only modestly, so document strength and execution quality still matter most.",
                    tone="neutral",
                )
            )

        if delta.timeline_months_change <= -1.5:
            items.append(
                CaseSimulationImpactItem(
                    id="timeline-faster",
                    summary="The likely preparation timeline becomes shorter because readiness friction is reduced earlier in the case.",
                    tone="positive",
                )
            )
        elif delta.timeline_months_change >= 1.5:
            items.append(
                CaseSimulationImpactItem(
                    id="timeline-slower",
                    summary="The likely timeline becomes longer, which suggests more evidence-building or pathway friction before execution.",
                    tone="negative",
                )
            )

        if simulated_profile.english_level != current_profile.english_level:
            items.append(
                CaseSimulationImpactItem(
                    id="english-shift",
                    summary="English changes have a direct effect on both competitiveness and preparation speed for skilled routes.",
                    tone=(
                        "positive"
                        if self._english_rank(simulated_profile.english_level)
                        >= self._english_rank(current_profile.english_level)
                        else "negative"
                    ),
                )
            )

        if simulated_profile.available_capital != current_profile.available_capital:
            items.append(
                CaseSimulationImpactItem(
                    id="capital-shift",
                    summary=(
                        "More liquid capital improves execution flexibility, document readiness, and contingency room."
                        if (
                            simulated_profile.available_capital or 0
                        )
                        >= (current_profile.available_capital or 0)
                        else "Reduced capital makes the case more execution-sensitive and less flexible."
                    ),
                    tone=(
                        "positive"
                        if (simulated_profile.available_capital or 0)
                        >= (current_profile.available_capital or 0)
                        else "negative"
                    ),
                )
            )

        if (
            simulated_profile.target_country != current_profile.target_country
            or simulated_case.target_country != current_case.target_country
        ):
            items.append(
                CaseSimulationImpactItem(
                    id="target-shift",
                    summary="Changing the target country can reframe both probability and timeline assumptions, so it should be treated as a strategic reset.",
                    tone="neutral",
                )
            )

        return items[:4]

    def _build_recommendations(
        self,
        *,
        simulated_profile: UserProfile,
        simulated_case: ImmigrationCase,
    ) -> list[CaseSimulationRecommendation]:
        recommendations: list[CaseSimulationRecommendation] = []

        if self._english_rank(simulated_profile.english_level) < self._english_rank(
            EnglishLevel.ADVANCED
        ):
            recommendations.append(
                CaseSimulationRecommendation(
                    id="english",
                    title="Raise English evidence strength",
                    detail=(
                        "Improving English results is often the fastest way to improve competitiveness and reduce preparation drag."
                    ),
                    impact_label="High impact",
                )
            )

        if simulated_profile.available_capital is None or simulated_profile.available_capital < 70000:
            recommendations.append(
                CaseSimulationRecommendation(
                    id="capital",
                    title="Strengthen liquid capital readiness",
                    detail=(
                        "A stronger capital buffer improves filing flexibility, document preparation, and fallback planning."
                    ),
                    impact_label="Medium impact",
                )
            )

        if simulated_profile.education_level in {
            None,
            EducationLevel.HIGH_SCHOOL,
            EducationLevel.VOCATIONAL,
            EducationLevel.ASSOCIATE,
        }:
            recommendations.append(
                CaseSimulationRecommendation(
                    id="education",
                    title="Strengthen education positioning",
                    detail=(
                        "Credential evaluation, equivalency work, or additional qualification evidence can noticeably improve pathway fit."
                    ),
                    impact_label="High impact",
                )
            )

        if simulated_profile.years_of_experience is None or simulated_profile.years_of_experience < 5:
            recommendations.append(
                CaseSimulationRecommendation(
                    id="experience",
                    title="Build stronger experience evidence",
                    detail=(
                        "Longer, better-documented experience usually improves both suitability and confidence for skilled pathways."
                    ),
                    impact_label="Foundational",
                )
            )

        if not simulated_case.target_program:
            recommendations.append(
                CaseSimulationRecommendation(
                    id="pathway",
                    title="Lock down the target pathway",
                    detail=(
                        "Probability and timeline become much more reliable once the case names a specific target program."
                    ),
                    impact_label="Foundational",
                )
            )

        if not recommendations:
            recommendations.append(
                CaseSimulationRecommendation(
                    id="evidence-quality",
                    title="Focus on evidence quality next",
                    detail=(
                        "The simulated inputs are already strong, so the next lift will likely come from cleaner, pathway-specific documentation."
                    ),
                    impact_label="Foundational",
                )
            )

        return recommendations[:3]

    def _english_rank(self, level: EnglishLevel | None) -> int:
        ranks = {
            EnglishLevel.NONE: 0,
            EnglishLevel.BASIC: 1,
            EnglishLevel.INTERMEDIATE: 2,
            EnglishLevel.ADVANCED: 3,
            EnglishLevel.FLUENT: 4,
            EnglishLevel.NATIVE: 5,
            None: -1,
        }
        return ranks[level]
