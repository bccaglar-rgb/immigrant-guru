"""Profile-based immigration analysis endpoint — no case required."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.services.profile_service import ProfileService
from app.services.profile_analysis_service import analyze_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

_profile_service = ProfileService()


@router.post("/profile-analysis")
async def run_profile_analysis(
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """Analyze authenticated user's profile and return visa recommendations.

    No case_id required — this runs on profile data alone.
    Deterministic scoring — no AI calls, instant response.
    """
    profile = await _profile_service.get_or_create_profile(session, current_user)
    result = analyze_profile(profile)
    return result
