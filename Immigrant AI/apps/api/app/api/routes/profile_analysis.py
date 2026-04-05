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

    Free users get: summary + top matches preview + short recommendation.
    Premium users get: full analysis + roadmap + documents + costs.
    """
    profile = await _profile_service.get_or_create_profile(session, current_user)
    result = analyze_profile(profile)

    user_plan = current_user.plan or "free"
    is_premium = user_plan != "free"

    # Add plan info and gate premium content
    result["user_plan"] = user_plan
    result["is_premium"] = is_premium

    if not is_premium:
        # Free users: limit visa_matches to preview (no details)
        for match in result.get("visa_matches", []):
            match.pop("description", None)
        # Hide recommendation reason detail
        if result.get("recommendation"):
            result["recommendation"]["reason"] = (
                f"Your best option may be {result['recommendation']['visa_type']} "
                f"({result['recommendation']['country']}). "
                "Upgrade to see why this fits your profile and get a full step-by-step plan."
            )
        # Add AI upsell message
        result["ai_upsell_message"] = (
            "I've reviewed your profile and found some promising options. "
            "If you upgrade, I can give you a full step-by-step immigration plan, "
            "explain the best visa strategy for you, estimate your timeline and costs, "
            "and help you move forward with confidence."
        )
    else:
        result["ai_upsell_message"] = None
        # Premium: add extra detail
        result["premium_roadmap"] = _build_roadmap(result)
        result["premium_costs"] = _estimate_costs(result)
        result["premium_documents"] = _build_document_checklist(result)

    return result


def _build_roadmap(result: dict) -> list[dict]:
    """Generate a step-by-step roadmap for premium users."""
    best = result.get("recommendation")
    if not best:
        return []

    visa = best.get("visa_type", "")
    steps = [
        {"step": 1, "title": "Complete your profile", "description": "Ensure all profile fields are filled for maximum accuracy.", "status": "done"},
        {"step": 2, "title": "Gather documents", "description": "Collect passport, education credentials, work experience letters, and financial evidence.", "status": "pending"},
        {"step": 3, "title": "Prepare application", "description": f"Build your {visa} application package with required forms and evidence.", "status": "pending"},
        {"step": 4, "title": "Submit filing", "description": f"Submit your {visa} petition to the relevant immigration authority.", "status": "pending"},
        {"step": 5, "title": "Wait for processing", "description": "Monitor your case status during the review period.", "status": "pending"},
        {"step": 6, "title": "Interview (if required)", "description": "Prepare for and attend any required interview.", "status": "pending"},
        {"step": 7, "title": "Receive decision", "description": "Get your approval and plan your next steps.", "status": "pending"},
    ]
    return steps


def _estimate_costs(result: dict) -> dict:
    """Estimate immigration costs for premium users."""
    best = result.get("recommendation")
    if not best:
        return {}

    visa = best.get("visa_type", "")

    cost_map = {
        "EB-2 NIW": {"filing": 715, "legal": 3500, "medical": 500, "other": 300, "total_low": 4500, "total_high": 8000},
        "H-1B": {"filing": 1710, "legal": 2500, "medical": 0, "other": 500, "total_low": 3500, "total_high": 6000},
        "EB-1A": {"filing": 715, "legal": 5000, "medical": 500, "other": 500, "total_low": 5500, "total_high": 12000},
        "O-1A": {"filing": 460, "legal": 4000, "medical": 0, "other": 300, "total_low": 4000, "total_high": 8000},
        "Express Entry": {"filing": 1365, "legal": 1500, "medical": 300, "other": 500, "total_low": 2500, "total_high": 5000},
        "Provincial Nominee": {"filing": 1365, "legal": 2000, "medical": 300, "other": 500, "total_low": 3000, "total_high": 6000},
        "EU Blue Card": {"filing": 100, "legal": 1000, "medical": 200, "other": 300, "total_low": 1200, "total_high": 3000},
        "Skilled Worker": {"filing": 1423, "legal": 1500, "medical": 300, "other": 500, "total_low": 2500, "total_high": 5000},
    }

    return cost_map.get(visa, {"filing": 500, "legal": 2000, "medical": 300, "other": 300, "total_low": 2000, "total_high": 5000})


def _build_document_checklist(result: dict) -> list[dict]:
    """Build document checklist for premium users."""
    return [
        {"document": "Valid passport", "required": True, "notes": "Must be valid for 6+ months beyond intended stay"},
        {"document": "Education credentials", "required": True, "notes": "Degrees, transcripts, credential evaluation"},
        {"document": "Work experience letters", "required": True, "notes": "From current and past employers on company letterhead"},
        {"document": "Resume / CV", "required": True, "notes": "Detailed professional history"},
        {"document": "Financial evidence", "required": True, "notes": "Bank statements, tax returns"},
        {"document": "Recommendation letters", "required": False, "notes": "From independent experts in your field"},
        {"document": "Publications / patents", "required": False, "notes": "If applicable to your visa category"},
        {"document": "Police clearance", "required": True, "notes": "From countries where you lived 6+ months"},
        {"document": "Medical examination", "required": True, "notes": "From USCIS-approved physician"},
        {"document": "Passport photos", "required": True, "notes": "Meeting specific size and format requirements"},
    ]
