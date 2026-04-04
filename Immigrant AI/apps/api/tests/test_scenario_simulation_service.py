from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.enums import (
    EducationLevel,
    EnglishLevel,
    ImmigrationCaseStatus,
)
from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.simulation import CaseSimulationRequest, ScenarioSimulationProfileOverrides
from app.services.case_service import CaseService
from app.services.pathway_probability_service import PathwayProbabilityService
from app.services.profile_service import ProfileService
from app.services.scenario_simulation_service import ScenarioSimulationService
from app.services.scoring_service import ScoringService
from app.services.timeline_simulation_service import TimelineSimulationService
from app.services.missing_information_service import MissingInformationService


class _StubCaseService(CaseService):
    def __init__(self, immigration_case: ImmigrationCase) -> None:
        self._immigration_case = immigration_case

    async def get_case(self, session, user, case_id):  # type: ignore[override]
        return self._immigration_case


class _StubProfileService(ProfileService):
    def __init__(self, profile: UserProfile) -> None:
        self._profile = profile

    async def get_or_create_profile(self, session, user):  # type: ignore[override]
        return self._profile


def _build_profile() -> UserProfile:
    return UserProfile(
        id=uuid4(),
        user_id=uuid4(),
        nationality="Turkish",
        current_country="Turkey",
        target_country="Canada",
        education_level=EducationLevel.BACHELOR,
        english_level=EnglishLevel.BASIC,
        profession="Software Engineer",
        years_of_experience=2,
        available_capital=Decimal("15000.00"),
        relocation_timeline="within_6_months",
        preferred_language="en",
        marital_status="single",
        children_count=0,
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
    )


def _build_case(user_id) -> ImmigrationCase:
    return ImmigrationCase(
        id=uuid4(),
        user_id=user_id,
        title="Canada skilled pathway",
        target_country="Canada",
        target_program="Express Entry",
        current_stage="document_prep",
        status=ImmigrationCaseStatus.IN_REVIEW,
        notes="Collect stronger language and employment evidence.",
    )


@pytest.mark.asyncio
async def test_scenario_simulation_service_improves_probability_and_timeline() -> None:
    profile = _build_profile()
    immigration_case = _build_case(profile.user_id)

    probability_service = PathwayProbabilityService(
        case_service=_StubCaseService(immigration_case),
        profile_service=_StubProfileService(profile),
        scoring_service=ScoringService(),
        missing_information_service=MissingInformationService(),
    )
    timeline_service = TimelineSimulationService(
        case_service=_StubCaseService(immigration_case),
        profile_service=_StubProfileService(profile),
        missing_information_service=MissingInformationService(),
        snapshot_ttl_minutes=0,
    )
    service = ScenarioSimulationService(
        case_service=_StubCaseService(immigration_case),
        profile_service=_StubProfileService(profile),
        scoring_service=ScoringService(),
        pathway_probability_service=probability_service,
        timeline_simulation_service=timeline_service,
    )

    result = await service.simulate_case(
        session=None,  # type: ignore[arg-type]
        user=SimpleNamespace(id=profile.user_id),
        case_id=immigration_case.id,
        payload=CaseSimulationRequest(
            profile_overrides=ScenarioSimulationProfileOverrides(
                english_level=EnglishLevel.ADVANCED,
                education_level=EducationLevel.MASTER,
                available_capital=Decimal("90000.00"),
                years_of_experience=7,
            )
        ),
    )

    assert result.simulated.probability_score > result.current.probability_score
    assert result.simulated.timeline_months < result.current.timeline_months
    assert result.delta.probability_score_change > 0
    assert result.delta.timeline_months_change < 0
    assert result.impact_summary
    assert result.recommended_improvements
