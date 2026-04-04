from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from app.models.enums import EducationLevel, EnglishLevel, ImmigrationCaseStatus
from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.scoring import (
    ImmigrationScoreRead,
    ScoreBreakdown,
    ScoreContribution,
    ScoreImpact,
)
from app.services.scoring_helpers import (
    bucket_points,
    contribution,
    is_present,
    ratio_score,
    round_score,
    top_reasons,
)


class ScoringService:
    """Deterministic product scoring engine for profile and case readiness."""

    _weights = {
        "profile_completeness": 0.30,
        "financial_readiness": 0.20,
        "professional_strength": 0.25,
        "case_readiness": 0.25,
    }

    _profile_fields = (
        "nationality",
        "current_country",
        "target_country",
        "education_level",
        "english_level",
        "profession",
        "years_of_experience",
        "available_capital",
        "relocation_timeline",
        "preferred_language",
        "marital_status",
        "children_count",
    )

    def score_case(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
    ) -> ImmigrationScoreRead:
        profile_breakdown = self._score_profile_completeness(profile)
        financial_breakdown = self._score_financial_readiness(profile)
        professional_breakdown = self._score_professional_strength(profile)
        case_breakdown = self._score_case_readiness(immigration_case)

        overall_score = round_score(
            profile_breakdown.score * self._weights["profile_completeness"]
            + financial_breakdown.score * self._weights["financial_readiness"]
            + professional_breakdown.score * self._weights["professional_strength"]
            + case_breakdown.score * self._weights["case_readiness"]
        )

        overall_reasons = (
            top_reasons(profile_breakdown.contributions, limit=1)
            + top_reasons(financial_breakdown.contributions, limit=1)
            + top_reasons(professional_breakdown.contributions, limit=1)
            + top_reasons(case_breakdown.contributions, limit=1)
        )

        return ImmigrationScoreRead(
            case_id=immigration_case.id,
            disclaimer=(
                "This is a transparent product guidance score based on profile and case readiness. "
                "It is not a legal determination or approval prediction."
            ),
            overall_score=overall_score,
            profile_completeness=profile_breakdown,
            financial_readiness=financial_breakdown,
            professional_strength=professional_breakdown,
            case_readiness=case_breakdown,
            overall_reasons=overall_reasons[:6],
            generated_at=datetime.now(timezone.utc),
        )

    def _score_profile_completeness(self, profile: UserProfile) -> ScoreBreakdown:
        completed = sum(1 for field_name in self._profile_fields if is_present(getattr(profile, field_name)))
        total = len(self._profile_fields)
        score = ratio_score(completed, total)

        contributions = [
            contribution(
                label="Core profile inputs",
                points=score,
                impact=ScoreImpact.POSITIVE if completed >= total / 2 else ScoreImpact.NEUTRAL,
                explanation=f"{completed} of {total} core profile signals are available.",
            )
        ]

        missing_fields = [
            field_name.replace("_", " ")
            for field_name in self._profile_fields
            if not is_present(getattr(profile, field_name))
        ]
        if missing_fields:
            contributions.append(
                contribution(
                    label="Missing profile fields",
                    points=-(100 - score),
                    impact=ScoreImpact.NEGATIVE,
                    explanation=(
                        "Missing profile inputs reduce scoring confidence, including "
                        + ", ".join(missing_fields[:4])
                        + (", and more." if len(missing_fields) > 4 else ".")
                    ),
                )
            )

        summary = (
            "Core immigration profile inputs are mostly present."
            if score >= 70
            else "Several important profile inputs are still missing."
        )

        return ScoreBreakdown(
            score=score,
            weight=self._weights["profile_completeness"],
            summary=summary,
            contributions=contributions,
        )

    def _score_financial_readiness(self, profile: UserProfile) -> ScoreBreakdown:
        contributions: list[ScoreContribution] = []
        score = 0.0

        capital: Decimal | None = profile.available_capital
        if capital is not None:
            score += 25
            contributions.append(
                contribution(
                    label="Capital disclosed",
                    points=25,
                    impact=ScoreImpact.POSITIVE,
                    explanation="Declared available capital gives the product a financial baseline to work from.",
                )
            )

            capital_points = bucket_points(
                capital,
                (
                    (1, 10),
                    (10000, 20),
                    (25000, 30),
                    (50000, 40),
                    (100000, 50),
                ),
            )
            score += capital_points
            contributions.append(
                contribution(
                    label="Capital band",
                    points=capital_points,
                    impact=ScoreImpact.POSITIVE if capital_points >= 30 else ScoreImpact.NEUTRAL,
                    explanation=f"Declared capital of {capital} places the profile in the current funding band.",
                )
            )
        else:
            contributions.append(
                contribution(
                    label="Capital missing",
                    points=-35,
                    impact=ScoreImpact.NEGATIVE,
                    explanation="Financial readiness is constrained because available capital has not been declared.",
                )
            )

        planning_points = 0.0
        if is_present(profile.target_country):
            planning_points += 5
        if is_present(profile.relocation_timeline):
            planning_points += 10

        score += planning_points
        contributions.append(
            contribution(
                label="Planning signals",
                points=planning_points,
                impact=ScoreImpact.POSITIVE if planning_points >= 10 else ScoreImpact.NEUTRAL,
                explanation=(
                    "Financial planning context improves when target destination and relocation timing are explicit."
                ),
            )
        )

        final_score = round_score(score)
        summary = (
            "Financial readiness looks usable for product planning."
            if final_score >= 60
            else "Financial readiness is still under-defined for reliable planning."
        )
        return ScoreBreakdown(
            score=final_score,
            weight=self._weights["financial_readiness"],
            summary=summary,
            contributions=contributions,
        )

    def _score_professional_strength(self, profile: UserProfile) -> ScoreBreakdown:
        contributions: list[ScoreContribution] = []
        score = 0.0

        education_points = {
            EducationLevel.DOCTORATE: 30,
            EducationLevel.MASTER: 26,
            EducationLevel.BACHELOR: 22,
            EducationLevel.ASSOCIATE: 16,
            EducationLevel.VOCATIONAL: 12,
            EducationLevel.HIGH_SCHOOL: 8,
            EducationLevel.OTHER: 10,
        }.get(profile.education_level, 0)
        score += education_points
        contributions.append(
            contribution(
                label="Education signal",
                points=education_points,
                impact=ScoreImpact.POSITIVE if education_points >= 20 else ScoreImpact.NEUTRAL,
                explanation="Education level contributes to how competitive the professional profile appears.",
            )
        )

        experience_points = bucket_points(
            profile.years_of_experience,
            (
                (1, 6),
                (2, 12),
                (4, 20),
                (7, 25),
                (10, 30),
            ),
        )
        score += experience_points
        contributions.append(
            contribution(
                label="Experience depth",
                points=experience_points,
                impact=ScoreImpact.POSITIVE if experience_points >= 20 else ScoreImpact.NEUTRAL,
                explanation="Years of experience strengthen the case for skilled and merit-based pathways.",
            )
        )

        english_points = {
            EnglishLevel.NATIVE: 25,
            EnglishLevel.FLUENT: 22,
            EnglishLevel.ADVANCED: 18,
            EnglishLevel.INTERMEDIATE: 12,
            EnglishLevel.BASIC: 6,
            EnglishLevel.NONE: 0,
        }.get(profile.english_level, 0)
        score += english_points
        contributions.append(
            contribution(
                label="English proficiency",
                points=english_points,
                impact=ScoreImpact.POSITIVE if english_points >= 18 else ScoreImpact.NEUTRAL,
                explanation="Declared English level contributes to mobility and pathway competitiveness signals.",
            )
        )

        profession_points = 15 if is_present(profile.profession) else 0
        score += profession_points
        contributions.append(
            contribution(
                label="Professional identity",
                points=profession_points if profession_points else -10,
                impact=ScoreImpact.POSITIVE if profession_points else ScoreImpact.NEGATIVE,
                explanation=(
                    "Profession is recorded and can anchor pathway positioning."
                    if profession_points
                    else "Profession is not recorded, which weakens professional positioning."
                ),
            )
        )

        final_score = round_score(score)
        summary = (
            "Professional profile appears comparatively strong for product guidance."
            if final_score >= 65
            else "Professional strength is only partially defined and should be refined."
        )
        return ScoreBreakdown(
            score=final_score,
            weight=self._weights["professional_strength"],
            summary=summary,
            contributions=contributions,
        )

    def _score_case_readiness(self, immigration_case: ImmigrationCase) -> ScoreBreakdown:
        contributions: list[ScoreContribution] = []
        score = 10.0

        contributions.append(
            contribution(
                label="Case title",
                points=10,
                impact=ScoreImpact.POSITIVE,
                explanation="A named strategy case exists and can be tracked within the product.",
            )
        )

        if is_present(immigration_case.target_country):
            score += 20
            contributions.append(
                contribution(
                    label="Destination selected",
                    points=20,
                    impact=ScoreImpact.POSITIVE,
                    explanation="A target country is defined for the case.",
                )
            )
        else:
            contributions.append(
                contribution(
                    label="Destination missing",
                    points=-20,
                    impact=ScoreImpact.NEGATIVE,
                    explanation="Case readiness is limited because no target country is defined.",
                )
            )

        if is_present(immigration_case.target_program):
            score += 20
            contributions.append(
                contribution(
                    label="Pathway selected",
                    points=20,
                    impact=ScoreImpact.POSITIVE,
                    explanation="A target program or pathway is already identified.",
                )
            )
        else:
            contributions.append(
                contribution(
                    label="Pathway missing",
                    points=-15,
                    impact=ScoreImpact.NEGATIVE,
                    explanation="Case readiness is lower because the target program is not defined yet.",
                )
            )

        if is_present(immigration_case.current_stage):
            score += 15
            contributions.append(
                contribution(
                    label="Execution stage",
                    points=15,
                    impact=ScoreImpact.POSITIVE,
                    explanation="Current stage is recorded, which improves execution clarity.",
                )
            )

        note_length = len(immigration_case.notes.strip()) if immigration_case.notes else 0
        if note_length >= 40:
            score += 15
            contributions.append(
                contribution(
                    label="Strategy notes",
                    points=15,
                    impact=ScoreImpact.POSITIVE,
                    explanation="Detailed case notes provide stronger planning context.",
                )
            )
        elif note_length > 0:
            score += 8
            contributions.append(
                contribution(
                    label="Basic notes",
                    points=8,
                    impact=ScoreImpact.NEUTRAL,
                    explanation="Case notes exist, but the planning context is still brief.",
                )
            )

        status_points = {
            ImmigrationCaseStatus.DRAFT: 4,
            ImmigrationCaseStatus.IN_REVIEW: 10,
            ImmigrationCaseStatus.ACTIVE: 15,
            ImmigrationCaseStatus.CLOSED: 10,
        }[immigration_case.status]
        score += status_points
        contributions.append(
            contribution(
                label="Case status",
                points=status_points,
                impact=ScoreImpact.POSITIVE if immigration_case.status != ImmigrationCaseStatus.DRAFT else ScoreImpact.NEUTRAL,
                explanation=f"Case status is {immigration_case.status.value}, which affects workflow readiness.",
            )
        )

        score_signal_points = 0.0
        if immigration_case.latest_score is not None:
            score_signal_points += 5
        if immigration_case.risk_score is not None:
            score_signal_points += 5
        if score_signal_points:
            score += score_signal_points
            contributions.append(
                contribution(
                    label="Existing evaluation signals",
                    points=score_signal_points,
                    impact=ScoreImpact.POSITIVE,
                    explanation="The case already contains score or risk metadata for downstream workflows.",
                )
            )

        final_score = round_score(score)
        summary = (
            "Case structure is ready for product guidance and iteration."
            if final_score >= 65
            else "Case structure exists but still needs more pathway or execution detail."
        )
        return ScoreBreakdown(
            score=final_score,
            weight=self._weights["case_readiness"],
            summary=summary,
            contributions=contributions,
        )

