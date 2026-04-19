from types import SimpleNamespace
from uuid import uuid4

from app.models.enums import EducationLevel, EnglishLevel, ImmigrationCaseStatus
from app.services.ai.scoring_service import ScoringService


def test_scoring_service_returns_interpretable_breakdown() -> None:
    service = ScoringService()
    profile = SimpleNamespace(
        nationality="Turkish",
        current_country="Canada",
        target_country="United States",
        education_level=EducationLevel.MASTER,
        english_level=EnglishLevel.ADVANCED,
        profession="Software Engineer",
        years_of_experience=8,
        available_capital=75000,
        relocation_timeline="within_6_months",
        preferred_language="en",
        marital_status="married",
        children_count=1,
    )
    immigration_case = SimpleNamespace(
        id=uuid4(),
        title="U.S. employment-based migration plan",
        target_country="United States",
        target_program="EB-2 NIW",
        current_stage="eligibility_review",
        status=ImmigrationCaseStatus.IN_REVIEW,
        notes="Collect recommendation letters and evidence of industry impact.",
        latest_score=None,
        risk_score=None,
    )

    result = service.score_case(profile=profile, immigration_case=immigration_case)

    assert result.overall_score > 0
    assert result.profile_completeness.score >= 80
    assert result.professional_strength.score >= 60
    assert result.case_readiness.score >= 60
    assert result.disclaimer.startswith("This is a transparent product guidance score")
    assert result.overall_reasons

