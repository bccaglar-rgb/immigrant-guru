from __future__ import annotations

from app.schemas.visa_match import (
    VisaBacklogLevel,
    VisaMatchConfidenceLevel,
    VisaMatchMarketContext,
    VisaMatchRequest,
    VisaQuotaPressure,
)
from app.services.eligibility_engine_service import EligibilityEngineService
from app.services.visa_matching_service import VisaMatchingService


def build_service() -> VisaMatchingService:
    return VisaMatchingService(eligibility_engine=EligibilityEngineService())


def build_payload(
    *,
    years_of_experience: int = 6,
    criminal_record_flag: bool = False,
    quota_pressure: VisaQuotaPressure = VisaQuotaPressure.MEDIUM,
    backlog_level: VisaBacklogLevel = VisaBacklogLevel.MEDIUM,
    backlog_months: float | None = None,
) -> VisaMatchRequest:
    return VisaMatchRequest(
        user_profile={
            "education_level": "master",
            "years_of_experience": years_of_experience,
            "criminal_record_flag": criminal_record_flag,
        },
        visa_requirements={
            "required_rules": [
                {
                    "field": "education_level",
                    "operator": "in",
                    "value": ["bachelor", "master", "doctorate"],
                    "label": "A qualifying degree is required.",
                }
            ],
            "disqualifier_rules": [
                {
                    "field": "criminal_record_flag",
                    "operator": "eq",
                    "value": True,
                    "label": "A disqualifying criminal record was provided.",
                }
            ],
            "strength_rules": [
                {
                    "field": "years_of_experience",
                    "operator": "gte",
                    "value": 5,
                    "label": "At least 5 years of relevant experience improves the match.",
                }
            ],
        },
        market_context=VisaMatchMarketContext(
            quota_pressure=quota_pressure,
            backlog_level=backlog_level,
            backlog_months=backlog_months,
        ),
    )


def test_visa_match_caps_score_when_not_eligible() -> None:
    response = build_service().evaluate(
        payload=build_payload(criminal_record_flag=True),
    )

    assert response.match_score <= 40
    assert response.confidence_level == VisaMatchConfidenceLevel.LOW
    assert "does not fully clear" in response.reasoning


def test_visa_match_reduces_score_when_backlog_is_high() -> None:
    service = build_service()

    favorable = service.evaluate(
        payload=build_payload(
            quota_pressure=VisaQuotaPressure.LOW,
            backlog_level=VisaBacklogLevel.LOW,
            backlog_months=2,
        )
    )
    constrained = service.evaluate(
        payload=build_payload(
            quota_pressure=VisaQuotaPressure.HIGH,
            backlog_level=VisaBacklogLevel.HIGH,
            backlog_months=18,
        )
    )

    assert constrained.match_score < favorable.match_score


def test_visa_match_increases_score_for_strong_profile() -> None:
    service = build_service()

    weaker = service.evaluate(payload=build_payload(years_of_experience=2))
    stronger = service.evaluate(payload=build_payload(years_of_experience=9))

    assert stronger.match_score > weaker.match_score
    assert stronger.confidence_level in {
        VisaMatchConfidenceLevel.MEDIUM,
        VisaMatchConfidenceLevel.HIGH,
    }
