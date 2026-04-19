from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ImmigrationCaseStatus
from app.models.immigration_case import ImmigrationCase
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.comparison import (
    ComparisonDifficultyLevel,
    CountryComparisonItem,
    CountryComparisonRequest,
    CountryComparisonResponse,
)
from app.services.cases.comparison_helpers import (
    deduplicate_strings,
    difficulty_weight,
    resolve_cost_level,
    timeline_weight,
)
from app.services.ai.missing_information_service import MissingInformationService
from app.services.ai.pathway_probability_service import PathwayProbabilityService
from app.services.profile.profile_service import ProfileService
from app.services.ai.scoring_service import ScoringService
from app.services.ai.timeline_simulation_service import TimelineSimulationService


class CountryComparisonService:
    """Deterministic comparison engine for multi-country immigration options."""

    def __init__(
        self,
        *,
        profile_service: ProfileService,
        scoring_service: ScoringService,
        missing_information_service: MissingInformationService,
        pathway_probability_service: PathwayProbabilityService,
        timeline_simulation_service: TimelineSimulationService,
    ) -> None:
        self._profile_service = profile_service
        self._scoring_service = scoring_service
        self._missing_information_service = missing_information_service
        self._pathway_probability_service = pathway_probability_service
        self._timeline_simulation_service = timeline_simulation_service

    async def compare(
        self,
        *,
        session: AsyncSession,
        user: User,
        payload: CountryComparisonRequest,
    ) -> CountryComparisonResponse:
        profile = await self._profile_service.get_or_create_profile(session, user)
        return self.build(profile=profile, user=user, payload=payload)

    def build(
        self,
        *,
        profile: UserProfile,
        user: User,
        payload: CountryComparisonRequest,
    ) -> CountryComparisonResponse:
        ranked_items: list[tuple[float, CountryComparisonItem]] = []

        for option in payload.options:
            immigration_case = self._build_virtual_case(
                user=user,
                country=option.country,
                pathway=option.pathway,
            )
            score = self._scoring_service.score_case(
                profile=profile,
                immigration_case=immigration_case,
            )
            missing_information = self._missing_information_service.evaluate(
                profile=profile,
                immigration_case=immigration_case,
            )
            probability = self._pathway_probability_service.evaluate_option(
                profile=profile,
                immigration_case=immigration_case,
            )
            timeline = self._timeline_simulation_service.build_timeline(
                profile=profile,
                immigration_case=immigration_case,
            )

            difficulty = self._resolve_difficulty(
                probability_score=probability.probability_score,
                missing_critical_count=len(missing_information.critical_items),
                timeline_months=timeline.total_estimated_duration_months,
            )
            item = CountryComparisonItem(
                country=option.country,
                pathway=option.pathway,
                success_probability=probability.probability_score,
                estimated_time_months=timeline.total_estimated_duration_months,
                cost_level=resolve_cost_level(
                    country=option.country,
                    pathway=option.pathway,
                    has_capital=profile.available_capital is not None,
                ),
                difficulty=difficulty,
                key_advantages=self._build_advantages(
                    score_reasons=score.overall_reasons,
                    strengths=probability.strengths,
                ),
                key_disadvantages=self._build_disadvantages(
                    weaknesses=probability.weaknesses,
                    risks=probability.key_risk_factors,
                ),
            )
            composite_score = self._rank_option(
                success_probability=item.success_probability,
                readiness_score=score.overall_score,
                difficulty=item.difficulty,
                timeline_months=item.estimated_time_months,
            )
            ranked_items.append((composite_score, item))

        ranked_items.sort(
            key=lambda pair: (
                pair[0],
                pair[1].success_probability,
                -pair[1].estimated_time_months,
            ),
            reverse=True,
        )
        comparison = [item for _, item in ranked_items]
        best_option = comparison[0]

        return CountryComparisonResponse(
            comparison=comparison,
            best_option=f"{best_option.country} - {best_option.pathway}",
            reasoning=self._build_reasoning(
                best_option=best_option,
                alternatives=comparison[1:],
            ),
            generated_at=datetime.now(timezone.utc),
        )

    def _build_virtual_case(
        self,
        *,
        user: User,
        country: str,
        pathway: str,
    ) -> ImmigrationCase:
        return ImmigrationCase(
            id=uuid4(),
            user_id=user.id,
            title=f"{country} {pathway} comparison scenario",
            target_country=country,
            target_program=pathway,
            current_stage="comparison_review",
            status=ImmigrationCaseStatus.DRAFT,
            notes="Virtual scenario for deterministic comparison.",
        )

    def _resolve_difficulty(
        self,
        *,
        probability_score: float,
        missing_critical_count: int,
        timeline_months: float,
    ) -> ComparisonDifficultyLevel:
        if probability_score >= 75 and missing_critical_count <= 2 and timeline_months <= 12:
            return ComparisonDifficultyLevel.LOW
        if probability_score >= 55 and missing_critical_count <= 5 and timeline_months <= 18:
            return ComparisonDifficultyLevel.MEDIUM
        return ComparisonDifficultyLevel.HIGH

    def _build_advantages(
        self,
        *,
        score_reasons: list[str],
        strengths: list[str],
    ) -> list[str]:
        return deduplicate_strings(
            [*strengths, *score_reasons],
            limit=4,
        )

    def _build_disadvantages(
        self,
        *,
        weaknesses: list[str],
        risks: list[str],
    ) -> list[str]:
        return deduplicate_strings(
            [*risks, *weaknesses],
            limit=4,
        )

    def _rank_option(
        self,
        *,
        success_probability: float,
        readiness_score: float,
        difficulty: ComparisonDifficultyLevel,
        timeline_months: float,
    ) -> float:
        return (
            success_probability * 0.55
            + readiness_score * 0.25
            + difficulty_weight(difficulty)
            + timeline_weight(timeline_months)
        )

    def _build_reasoning(
        self,
        *,
        best_option: CountryComparisonItem,
        alternatives: list[CountryComparisonItem],
    ) -> str:
        if not alternatives:
            return (
                f"{best_option.country} - {best_option.pathway} is currently the strongest "
                "available option based on deterministic probability, timeline, and execution burden."
            )

        next_best = alternatives[0]
        return (
            f"{best_option.country} - {best_option.pathway} currently leads because it combines "
            f"a stronger success probability ({best_option.success_probability:.1f}) with a more "
            f"manageable timeline than {next_best.country} - {next_best.pathway}. "
            "This remains a planning-oriented comparison, not legal advice or an approval guarantee."
        )
