from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.comparison import CountryComparisonRequest, CountryComparisonResponse
from app.services.case_service import CaseService
from app.services.comparison_service import CountryComparisonService
from app.services.missing_information_service import MissingInformationService
from app.services.pathway_probability_service import PathwayProbabilityService
from app.services.profile_service import ProfileService
from app.services.scoring_service import ScoringService
from app.services.timeline_simulation_service import TimelineSimulationService

router = APIRouter(prefix="/comparison", tags=["comparison"])


def get_country_comparison_service() -> CountryComparisonService:
    settings = get_settings()
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
        snapshot_ttl_minutes=settings.timeline_snapshot_ttl_minutes,
    )
    return CountryComparisonService(
        profile_service=profile_service,
        scoring_service=scoring_service,
        missing_information_service=missing_information_service,
        pathway_probability_service=pathway_probability_service,
        timeline_simulation_service=timeline_simulation_service,
    )


@router.post(
    "",
    response_model=CountryComparisonResponse,
    summary="Compare multiple countries and pathways for the authenticated user's profile",
)
async def compare_countries(
    payload: CountryComparisonRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    comparison_service: CountryComparisonService = Depends(get_country_comparison_service),
) -> CountryComparisonResponse:
    return await comparison_service.compare(
        session=session,
        user=current_user,
        payload=payload,
    )
