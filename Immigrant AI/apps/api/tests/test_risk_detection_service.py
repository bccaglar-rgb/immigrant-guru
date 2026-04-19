from app.schemas.ai import RiskDetectionRequest
from app.services.ai.risk_detection_service import RiskDetectionService


def test_risk_detection_identifies_high_risk_profile_conditions() -> None:
    service = RiskDetectionService()

    result = service.detect(
        payload=RiskDetectionRequest(
            user_profile={
                "available_capital": "5000",
                "years_of_experience": 1,
                "english_level": "basic",
                "target_country": "Canada",
                "profession": "",
                "education_level": None,
                "prior_visa_refusal_flag": True,
            }
        )
    )

    assert len(result.red_flags) >= 4
    assert any(flag.red_flag == "Insufficient funds" for flag in result.red_flags)
    assert any(flag.red_flag == "Prior refusal risk" for flag in result.red_flags)


def test_risk_detection_allows_cleaner_profiles_without_red_flags() -> None:
    service = RiskDetectionService()

    result = service.detect(
        payload=RiskDetectionRequest(
            user_profile={
                "available_capital": "95000",
                "years_of_experience": 8,
                "english_level": "advanced",
                "target_country": "Canada",
                "profession": "Software Engineer",
                "education_level": "master",
                "criminal_record_flag": False,
                "prior_visa_refusal_flag": False,
                "nationality": "Turkish",
            }
        )
    )

    assert result.red_flags == []
