from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import (
    EducationLevel,
    EnglishLevel,
    ImmigrationCaseStatus,
    PathwayProbabilityConfidenceLevel,
)
from app.models.immigration_case import ImmigrationCase
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.probability import PathwayProbabilityRead
from app.schemas.scoring import ImmigrationScoreRead
from app.services.cases.case_service import CaseService
from app.services.ai.missing_information_service import MissingInformationEvaluation, MissingInformationService
from app.services.ai.probability_helpers import contains_any_keyword, deduplicate_strings
from app.services.profile.profile_service import ProfileService
from app.services.ai.scoring_helpers import round_score
from app.services.ai.scoring_service import ScoringService


class ProbabilityExplanationEnricher(Protocol):
    async def enrich(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        probability: PathwayProbabilityRead,
    ) -> dict[str, Any] | None: ...


class PathwayProbabilityService:
    """Deterministic-first probability engine for a specific case pathway."""

    _investor_program_keywords = (
        "invest",
        "investor",
        "startup",
        "entrepreneur",
        "business",
        "golden visa",
        "founder",
    )
    _education_heavy_keywords = (
        "study",
        "student",
        "graduate",
        "degree",
        "education",
    )
    _skilled_keywords = (
        "skilled",
        "worker",
        "express entry",
        "blue card",
        "niw",
        "h-1b",
        "employment",
        "talent",
    )

    def __init__(
        self,
        *,
        case_service: CaseService,
        profile_service: ProfileService,
        scoring_service: ScoringService,
        missing_information_service: MissingInformationService,
        explanation_enricher: ProbabilityExplanationEnricher | None = None,
    ) -> None:
        self._case_service = case_service
        self._profile_service = profile_service
        self._scoring_service = scoring_service
        self._missing_information_service = missing_information_service
        self._explanation_enricher = explanation_enricher

    async def evaluate_case(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
    ) -> PathwayProbabilityRead:
        immigration_case = await self._case_service.get_case(session, user, case_id)
        profile = await self._profile_service.get_or_create_profile(session, user)
        score = self._scoring_service.score_case(
            profile=profile,
            immigration_case=immigration_case,
        )
        missing_information = self._missing_information_service.evaluate(
            profile=profile,
            immigration_case=immigration_case,
        )

        probability = self._build_probability_result(
            profile=profile,
            immigration_case=immigration_case,
            score=score,
            missing_information=missing_information,
        )

        explanation_json = {
            "strengths": probability.strengths,
            "weaknesses": probability.weaknesses,
            "key_risk_factors": probability.key_risk_factors,
            "improvement_actions": probability.improvement_actions,
            "reasoning_summary": probability.reasoning_summary,
            "generated_at": probability.generated_at.isoformat(),
            "missing_information": {
                "critical": missing_information.critical_items,
                "helpful": missing_information.helpful_items,
            },
            "scoring_version": probability.scoring_version,
        }

        if self._explanation_enricher is not None:
            enriched = await self._explanation_enricher.enrich(
                profile=profile,
                immigration_case=immigration_case,
                probability=probability,
            )
            if enriched:
                explanation_json["ai_enrichment"] = enriched

        immigration_case.probability_score = Decimal(str(probability.probability_score))
        immigration_case.probability_confidence = probability.confidence_level
        immigration_case.probability_explanation_json = explanation_json
        await session.commit()
        await session.refresh(immigration_case)

        return probability

    def evaluate_option(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
    ) -> PathwayProbabilityRead:
        score = self._scoring_service.score_case(
            profile=profile,
            immigration_case=immigration_case,
        )
        missing_information = self._missing_information_service.evaluate(
            profile=profile,
            immigration_case=immigration_case,
        )
        return self._build_probability_result(
            profile=profile,
            immigration_case=immigration_case,
            score=score,
            missing_information=missing_information,
        )

    def _build_probability_result(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        score: ImmigrationScoreRead,
        missing_information: MissingInformationEvaluation,
    ) -> PathwayProbabilityRead:
        target_country = immigration_case.target_country or profile.target_country
        target_program = immigration_case.target_program

        pathway_fit_score, pathway_fit_strengths, pathway_fit_weaknesses = self._score_pathway_fit(
            profile=profile,
            immigration_case=immigration_case,
        )
        risk_penalty, explicit_risks = self._calculate_risk_penalty(
            profile=profile,
            immigration_case=immigration_case,
            missing_information=missing_information,
        )

        base_probability = (
            score.overall_score * 0.55
            + pathway_fit_score * 0.30
            + score.professional_strength.score * 0.10
            + score.case_readiness.score * 0.05
        )
        probability_score = round_score(base_probability - risk_penalty)
        confidence_level = self._resolve_confidence_level(
            probability_score=probability_score,
            missing_information=missing_information,
        )

        strengths = deduplicate_strings(
            [
                *self._strengths_from_score(score),
                *pathway_fit_strengths,
            ],
            limit=6,
        )
        weaknesses = deduplicate_strings(
            [
                *self._weaknesses_from_score(score),
                *pathway_fit_weaknesses,
                *missing_information.helpful_items,
            ],
            limit=6,
        )
        key_risk_factors = deduplicate_strings(
            [
                *explicit_risks,
                *missing_information.critical_items,
            ],
            limit=6,
        )
        improvement_actions = deduplicate_strings(
            self._build_improvement_actions(
                profile=profile,
                immigration_case=immigration_case,
                missing_information=missing_information,
                risks=key_risk_factors,
            ),
            limit=8,
        )
        reasoning_summary = self._build_reasoning_summary(
            probability_score=probability_score,
            confidence_level=confidence_level,
            target_country=target_country,
            target_program=target_program,
            critical_missing_count=len(missing_information.critical_items),
        )

        return PathwayProbabilityRead(
            case_id=immigration_case.id,
            target_country=target_country,
            target_program=target_program,
            disclaimer=(
                "This is a deterministic product probability estimate for planning support. "
                "It is not legal advice or an approval guarantee."
            ),
            probability_score=probability_score,
            confidence_level=confidence_level,
            strengths=strengths,
            weaknesses=weaknesses,
            key_risk_factors=key_risk_factors,
            improvement_actions=improvement_actions,
            reasoning_summary=reasoning_summary,
            generated_at=datetime.now(timezone.utc),
        )

    def _score_pathway_fit(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
    ) -> tuple[float, list[str], list[str]]:
        score = 15.0
        strengths: list[str] = []
        weaknesses: list[str] = []
        target_program = immigration_case.target_program

        if immigration_case.target_country or profile.target_country:
            score += 18
            strengths.append("A target country is already defined, which makes the pathway evaluation more specific.")
        else:
            weaknesses.append("Target country is still undefined, which weakens pathway-level confidence.")

        if target_program:
            score += 16
            strengths.append("The case already names a target pathway, so the evaluation can be more pathway-specific.")
        else:
            weaknesses.append("The case does not yet name a target program or pathway.")

        if immigration_case.current_stage:
            score += 8
        if immigration_case.notes:
            score += 6

        status_bonus = {
            ImmigrationCaseStatus.DRAFT: 2,
            ImmigrationCaseStatus.IN_REVIEW: 8,
            ImmigrationCaseStatus.ACTIVE: 10,
            ImmigrationCaseStatus.CLOSED: 0,
        }.get(immigration_case.status, 0)
        score += status_bonus

        if contains_any_keyword(target_program, self._skilled_keywords):
            if profile.profession and profile.years_of_experience:
                score += 14
                strengths.append("The professional profile provides a usable base for a skilled or employment-oriented pathway.")
            else:
                weaknesses.append("The professional profile is not fully specified for a skilled-pathway evaluation.")

            if profile.english_level in {
                EnglishLevel.ADVANCED,
                EnglishLevel.FLUENT,
                EnglishLevel.NATIVE,
            }:
                score += 10
            elif profile.english_level is None:
                weaknesses.append("English level is still missing for a skilled-pathway estimate.")

        if contains_any_keyword(target_program, self._investor_program_keywords):
            if profile.available_capital is not None and profile.available_capital >= 100000:
                score += 18
                strengths.append("Declared capital supports an investor-oriented pathway baseline.")
            else:
                weaknesses.append("Declared capital is not yet strong enough for a confident investor-pathway estimate.")

        if contains_any_keyword(target_program, self._education_heavy_keywords):
            if profile.education_level in {
                EducationLevel.BACHELOR,
                EducationLevel.MASTER,
                EducationLevel.DOCTORATE,
            }:
                score += 12
            else:
                weaknesses.append("Education profile is not yet strong enough for an education-heavy pathway estimate.")

        return round_score(score), strengths, weaknesses

    def _calculate_risk_penalty(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        missing_information: MissingInformationEvaluation,
    ) -> tuple[float, list[str]]:
        penalty = 0.0
        risks: list[str] = []

        if profile.criminal_record_flag is True:
            penalty += 28
            risks.append("Criminal record history materially increases rejection risk and uncertainty.")
        elif profile.criminal_record_flag is None:
            penalty += 6
            risks.append("Criminal record history is still unconfirmed.")

        if profile.prior_visa_refusal_flag is True:
            penalty += 14
            risks.append("Prior visa refusal history can reduce confidence in a straightforward approval path.")
        elif profile.prior_visa_refusal_flag is None:
            penalty += 5
            risks.append("Prior visa refusal history is still unconfirmed.")

        penalty += min(len(missing_information.critical_items) * 4.5, 22.0)

        if immigration_case.target_program is None:
            penalty += 8
            risks.append("No specific target program is set on the case yet.")

        if immigration_case.target_country is None and profile.target_country is None:
            penalty += 10
            risks.append("No destination country is locked, so the estimate remains less specific.")

        return penalty, risks

    def _strengths_from_score(self, score: ImmigrationScoreRead) -> list[str]:
        strengths: list[str] = []

        if score.profile_completeness.score >= 70:
            strengths.append("Core profile coverage is strong enough to support a more grounded probability estimate.")
        if score.professional_strength.score >= 65:
            strengths.append("Professional profile depth supports pathway competitiveness.")
        if score.financial_readiness.score >= 60:
            strengths.append("Declared financial readiness supports practical planning assumptions.")
        if score.case_readiness.score >= 60:
            strengths.append("Case readiness signals show that the pathway direction is more than just exploratory.")

        return strengths

    def _weaknesses_from_score(self, score: ImmigrationScoreRead) -> list[str]:
        weaknesses: list[str] = []

        if score.profile_completeness.score < 60:
            weaknesses.append("Profile completeness is still too limited for a high-confidence probability estimate.")
        if score.financial_readiness.score < 50:
            weaknesses.append("Financial readiness is still under-defined for this pathway direction.")
        if score.professional_strength.score < 55:
            weaknesses.append("Professional positioning is not yet strong enough for a confident pathway estimate.")
        if score.case_readiness.score < 55:
            weaknesses.append("Case readiness is still early, so execution confidence remains constrained.")

        return weaknesses

    def _build_improvement_actions(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        missing_information: MissingInformationEvaluation,
        risks: list[str],
    ) -> list[str]:
        actions: list[str] = []

        if missing_information.critical_items:
            actions.append("Resolve the critical missing profile and case inputs first because they most directly affect pathway screening.")
        if profile.prior_visa_refusal_flag is None:
            actions.append("Confirm prior visa refusal history and record the context clearly.")
        if profile.criminal_record_flag is None:
            actions.append("Confirm criminal record history so the pathway risk profile is explicit.")
        if immigration_case.target_program is None:
            actions.append("Choose a primary target program so the probability engine can evaluate a specific route.")
        if profile.english_level is None:
            actions.append("Record current English level or test strategy to improve skilled-pathway evaluation quality.")
        if profile.available_capital is None:
            actions.append("Declare available capital to improve financial readiness and pathway-fit precision.")
        if not risks:
            actions.append("Keep strengthening pathway-specific evidence so the current estimate can move into a higher-confidence range.")

        return actions

    def _resolve_confidence_level(
        self,
        *,
        probability_score: float,
        missing_information: MissingInformationEvaluation,
    ) -> PathwayProbabilityConfidenceLevel:
        critical_count = len(missing_information.critical_items)

        if critical_count <= 1 and probability_score >= 75:
            return PathwayProbabilityConfidenceLevel.HIGH
        if critical_count <= 3 and probability_score >= 50:
            return PathwayProbabilityConfidenceLevel.MEDIUM
        return PathwayProbabilityConfidenceLevel.LOW

    def _build_reasoning_summary(
        self,
        *,
        probability_score: float,
        confidence_level: PathwayProbabilityConfidenceLevel,
        target_country: str | None,
        target_program: str | None,
        critical_missing_count: int,
    ) -> str:
        pathway_label = target_program or "current pathway direction"
        country_label = target_country or "the current destination direction"

        if confidence_level is PathwayProbabilityConfidenceLevel.HIGH:
            return (
                f"{pathway_label} for {country_label} currently shows a comparatively strong deterministic profile, "
                f"with limited critical information gaps and enough readiness signals to support a higher-confidence planning estimate."
            )

        if confidence_level is PathwayProbabilityConfidenceLevel.MEDIUM:
            return (
                f"{pathway_label} for {country_label} looks plausible based on current readiness and profile signals, "
                f"but {critical_missing_count} critical information gap(s) or unresolved risks still keep the estimate in a moderate-confidence range."
            )

        return (
            f"{pathway_label} for {country_label} remains a low-confidence product estimate right now because "
            f"critical information gaps or unresolved pathway risks still materially weaken the case picture."
        )
