from types import SimpleNamespace
from uuid import uuid4

from app.models.enums import (
    EducationLevel,
    EnglishLevel,
    ImmigrationCaseStatus,
    RelocationTimeline,
)
from app.services.cases.case_service import CaseService
from app.services.ai.missing_information_service import MissingInformationService
from app.services.profile.profile_service import ProfileService
from app.services.ai.timeline_simulation_service import TimelineSimulationService


def _build_service() -> TimelineSimulationService:
    return TimelineSimulationService(
        case_service=CaseService(),
        profile_service=ProfileService(),
        missing_information_service=MissingInformationService(),
    )


def test_timeline_service_returns_skilled_pathway_steps_and_risks() -> None:
    service = _build_service()
    profile = SimpleNamespace(
        id=uuid4(),
        nationality="Turkish",
        current_country="Turkey",
        target_country="Canada",
        education_level=EducationLevel.BACHELOR,
        english_level=EnglishLevel.ADVANCED,
        profession="Software Engineer",
        years_of_experience=7,
        available_capital=50000,
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
        relocation_timeline=RelocationTimeline.WITHIN_6_MONTHS,
        marital_status="single",
        children_count=0,
        preferred_language="en",
        updated_at=None,
    )
    immigration_case = SimpleNamespace(
        id=uuid4(),
        title="Canada skilled case",
        target_country="Canada",
        target_program="Express Entry",
        current_stage="document_collection",
        status=ImmigrationCaseStatus.IN_REVIEW,
        notes="Prepare language and work evidence.",
        updated_at=None,
    )

    missing_information = MissingInformationService().evaluate(
        profile=profile,
        immigration_case=immigration_case,
    )

    result = service._build_timeline_result(  # noqa: SLF001
        profile=profile,
        immigration_case=immigration_case,
        missing_information=missing_information,
    )

    assert result.total_estimated_duration_months > 0
    assert len(result.steps) >= 4
    assert any("processing" in step.step_name.lower() or "review" in step.step_name.lower() for step in result.steps)
    assert result.acceleration_tips


def test_timeline_service_penalizes_incomplete_investor_case() -> None:
    service = _build_service()
    profile = SimpleNamespace(
        id=uuid4(),
        nationality=None,
        current_country=None,
        target_country="Portugal",
        education_level=None,
        english_level=EnglishLevel.BASIC,
        profession=None,
        years_of_experience=None,
        available_capital=None,
        criminal_record_flag=None,
        prior_visa_refusal_flag=True,
        relocation_timeline=RelocationTimeline.EXPLORING,
        marital_status=None,
        children_count=None,
        preferred_language=None,
        updated_at=None,
    )
    immigration_case = SimpleNamespace(
        id=uuid4(),
        title="Investor path",
        target_country="Portugal",
        target_program="Golden Visa",
        current_stage=None,
        status=ImmigrationCaseStatus.DRAFT,
        notes=None,
        updated_at=None,
    )

    missing_information = MissingInformationService().evaluate(
        profile=profile,
        immigration_case=immigration_case,
    )

    result = service._build_timeline_result(  # noqa: SLF001
        profile=profile,
        immigration_case=immigration_case,
        missing_information=missing_information,
    )

    assert result.total_estimated_duration_months >= 12
    assert result.delay_risks
    assert any("capital" in risk.lower() for risk in result.delay_risks)
