from app.schemas.eligibility import DeterministicEligibilityRequest
from app.services.ai.eligibility_engine_service import EligibilityEngineService


def test_eligibility_engine_marks_profile_eligible_when_all_required_rules_match() -> None:
    service = EligibilityEngineService()

    result = service.evaluate(
        payload=DeterministicEligibilityRequest(
            user_profile={
                "education_level": "master",
                "years_of_experience": 6,
                "english_level": "advanced",
                "criminal_record_flag": False,
            },
            visa_requirements={
                "required_rules": [
                    {
                        "field": "education_level",
                        "operator": "in",
                        "value": ["bachelor", "master", "doctorate"],
                        "label": "A qualifying degree is required.",
                    },
                    {
                        "field": "years_of_experience",
                        "operator": "gte",
                        "value": 5,
                        "label": "At least 5 years of experience is required.",
                    },
                ],
                "disqualifier_rules": [
                    {
                        "field": "criminal_record_flag",
                        "operator": "eq",
                        "value": True,
                        "label": "A criminal record disqualifies the applicant.",
                    }
                ],
                "strength_rules": [
                    {
                        "field": "english_level",
                        "operator": "in",
                        "value": ["advanced", "fluent", "native"],
                        "label": "Strong English increases competitiveness.",
                    }
                ],
            },
        )
    )

    assert result.eligible is True
    assert result.missing_requirements == []
    assert result.disqualifiers_triggered == []
    assert result.strength_score == 100.0


def test_eligibility_engine_rejects_when_disqualifier_is_triggered() -> None:
    service = EligibilityEngineService()

    result = service.evaluate(
        payload=DeterministicEligibilityRequest(
            user_profile={
                "education_level": "bachelor",
                "years_of_experience": 7,
                "criminal_record_flag": True,
            },
            visa_requirements={
                "required_rules": [
                    {
                        "field": "years_of_experience",
                        "operator": "gte",
                        "value": 5,
                        "label": "At least 5 years of experience is required.",
                    }
                ],
                "disqualifier_rules": [
                    {
                        "field": "criminal_record_flag",
                        "operator": "eq",
                        "value": True,
                        "label": "A criminal record disqualifies the applicant.",
                    }
                ],
            },
        )
    )

    assert result.eligible is False
    assert result.disqualifiers_triggered == [
        "A criminal record disqualifies the applicant."
    ]
    assert result.strength_score < 50.0
