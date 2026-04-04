from decimal import Decimal
from uuid import uuid4

from app.models.enums import EducationLevel, EnglishLevel, MaritalStatus, RelocationTimeline
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.comparison import CountryComparisonRequest
from app.services.case_service import CaseService
from app.services.comparison_service import CountryComparisonService
from app.services.missing_information_service import MissingInformationService
from app.services.pathway_probability_service import PathwayProbabilityService
from app.services.profile_service import ProfileService
from app.services.scoring_service import ScoringService
from app.services.timeline_simulation_service import TimelineSimulationService


def _build_service() -> CountryComparisonService:
    case_service = CaseService()
    profile_service = ProfileService()
    missing_information_service = MissingInformationService()
    scoring_service = ScoringService()
    pathway_probability_service = PathwayProbabilityService(
        case_service=case_service,
        profile_service=profile_service,
        scoring_service=scoring_service,
        missing_information_service=missing_information_service,
    )
    timeline_simulation_service = TimelineSimulationService(
        case_service=case_service,
        profile_service=profile_service,
        missing_information_service=missing_information_service,
    )
    return CountryComparisonService(
        profile_service=profile_service,
        scoring_service=scoring_service,
        missing_information_service=missing_information_service,
        pathway_probability_service=pathway_probability_service,
        timeline_simulation_service=timeline_simulation_service,
    )


def _build_profile() -> UserProfile:
    return UserProfile(
        id=uuid4(),
        user_id=uuid4(),
        nationality="Turkish",
        current_country="Turkey",
        target_country="Canada",
        marital_status=MaritalStatus.SINGLE,
        children_count=0,
        education_level=EducationLevel.BACHELOR,
        english_level=EnglishLevel.ADVANCED,
        profession="Software Engineer",
        years_of_experience=7,
        available_capital=Decimal("45000.00"),
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
        relocation_timeline=RelocationTimeline.WITHIN_6_MONTHS,
        preferred_language="en",
    )


def _build_user(profile: UserProfile) -> User:
    return User(
        id=profile.user_id,
        email="user@example.com",
        password_hash="hashed",
    )


def test_country_comparison_service_ranks_options() -> None:
    service = _build_service()
    profile = _build_profile()
    user = _build_user(profile)

    result = service.build(
        profile=profile,
        user=user,
        payload=CountryComparisonRequest(
            options=[
                {"country": "Canada", "pathway": "Express Entry"},
                {"country": "United States", "pathway": "EB-2 NIW"},
                {"country": "Portugal", "pathway": "Golden Visa"},
            ]
        ),
    )

    assert len(result.comparison) == 3
    assert result.best_option == f"{result.comparison[0].country} - {result.comparison[0].pathway}"
    assert result.comparison[0].success_probability >= result.comparison[-1].success_probability
    assert result.reasoning


def test_country_comparison_service_marks_investor_path_as_higher_cost_without_capital() -> None:
    service = _build_service()
    profile = _build_profile()
    profile.available_capital = None
    user = _build_user(profile)

    result = service.build(
        profile=profile,
        user=user,
        payload=CountryComparisonRequest(
            options=[
                {"country": "Portugal", "pathway": "Golden Visa"},
                {"country": "Germany", "pathway": "EU Blue Card"},
            ]
        ),
    )

    investor_option = next(item for item in result.comparison if item.pathway == "Golden Visa")
    assert investor_option.cost_level == "HIGH"
