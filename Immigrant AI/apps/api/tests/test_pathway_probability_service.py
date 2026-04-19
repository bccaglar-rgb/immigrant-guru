from types import SimpleNamespace
from uuid import uuid4

from app.models.enums import (
    EducationLevel,
    EnglishLevel,
    ImmigrationCaseStatus,
    PathwayProbabilityConfidenceLevel,
)
from app.services.cases.case_service import CaseService
from app.services.ai.missing_information_service import MissingInformationService
from app.services.ai.pathway_probability_service import PathwayProbabilityService
from app.services.profile.profile_service import ProfileService
from app.services.ai.scoring_service import ScoringService


def _build_service() -> PathwayProbabilityService:
    return PathwayProbabilityService(
        case_service=CaseService(),
        profile_service=ProfileService(),
        scoring_service=ScoringService(),
        missing_information_service=MissingInformationService(),
    )


def test_pathway_probability_service_returns_interpretable_result_for_strong_case() -> None:
    service = _build_service()
    profile = SimpleNamespace(
        nationality="Turkish",
        current_country="Turkey",
        target_country="Canada",
        education_level=EducationLevel.MASTER,
        english_level=EnglishLevel.ADVANCED,
        profession="Software Engineer",
        years_of_experience=8,
        available_capital=75000,
        relocation_timeline="within_6_months",
        preferred_language="en",
        marital_status="married",
        children_count=1,
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
    )
    immigration_case = SimpleNamespace(
        id=uuid4(),
        title="Canada skilled migration",
        target_country="Canada",
        target_program="Express Entry",
        current_stage="eligibility_review",
        status=ImmigrationCaseStatus.IN_REVIEW,
        notes="Collect language and credential evidence.",
        latest_score=None,
        risk_score=None,
    )

    score = ScoringService().score_case(profile=profile, immigration_case=immigration_case)
    missing_information = MissingInformationService().evaluate(
        profile=profile,
        immigration_case=immigration_case,
    )

    result = service._build_probability_result(  # noqa: SLF001
        profile=profile,
        immigration_case=immigration_case,
        score=score,
        missing_information=missing_information,
    )

    assert result.probability_score >= 60
    assert result.confidence_level in {
        PathwayProbabilityConfidenceLevel.MEDIUM,
        PathwayProbabilityConfidenceLevel.HIGH,
    }
    assert result.strengths
    assert result.reasoning_summary


def test_pathway_probability_service_penalizes_missing_critical_inputs() -> None:
    service = _build_service()
    profile = SimpleNamespace(
        nationality=None,
        current_country=None,
        target_country=None,
        education_level=None,
        english_level=None,
        profession=None,
        years_of_experience=None,
        available_capital=None,
        relocation_timeline=None,
        preferred_language=None,
        marital_status=None,
        children_count=None,
        criminal_record_flag=None,
        prior_visa_refusal_flag=None,
    )
    immigration_case = SimpleNamespace(
        id=uuid4(),
        title="Exploratory migration case",
        target_country=None,
        target_program=None,
        current_stage=None,
        status=ImmigrationCaseStatus.DRAFT,
        notes=None,
        latest_score=None,
        risk_score=None,
    )

    score = ScoringService().score_case(profile=profile, immigration_case=immigration_case)
    missing_information = MissingInformationService().evaluate(
        profile=profile,
        immigration_case=immigration_case,
    )

    result = service._build_probability_result(  # noqa: SLF001
        profile=profile,
        immigration_case=immigration_case,
        score=score,
        missing_information=missing_information,
    )

    assert result.probability_score <= 35
    assert result.confidence_level == PathwayProbabilityConfidenceLevel.LOW
    assert result.key_risk_factors
    assert result.improvement_actions
