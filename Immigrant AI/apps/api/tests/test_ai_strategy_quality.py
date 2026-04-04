from types import SimpleNamespace
from uuid import uuid4

from app.schemas.ai import AIStrategyModelOutput, ConfidenceLabel
from app.services.ai_response_normalizer import AIStrategyResponseNormalizer
from app.services.missing_information_service import MissingInformationService
from app.services.strategy_confidence_service import StrategyConfidenceService


def test_missing_information_service_groups_critical_and_helpful_gaps() -> None:
    service = MissingInformationService()

    fake_profile = SimpleNamespace(
        nationality=None,
        current_country="Turkey",
        target_country=None,
        education_level=None,
        english_level=None,
        profession="Engineer",
        years_of_experience=None,
        available_capital=None,
        criminal_record_flag=None,
        prior_visa_refusal_flag=None,
        relocation_timeline=None,
        marital_status=None,
        children_count=None,
        preferred_language=None,
    )
    fake_case = SimpleNamespace(
        id=uuid4(),
        title="US pathway review",
        target_country=None,
        target_program="Startup founder visa",
        current_stage=None,
        notes=None,
    )

    result = service.evaluate(profile=fake_profile, immigration_case=fake_case)

    assert any("Nationality is missing" in item for item in result.critical_items)
    assert any("Target country is not defined" in item for item in result.critical_items)
    assert any("Available capital is missing" in item for item in result.critical_items)
    assert any("Relocation timeline is missing" in item for item in result.helpful_items)
    assert result.profile_completeness_ratio < 60
    assert result.case_completeness_ratio < 60


def test_ai_response_normalizer_repairs_strategy_output() -> None:
    normalizer = AIStrategyResponseNormalizer()

    raw_output = AIStrategyModelOutput(
        summary="  ",
        plans=[
            {
                "label": "Plan A",
                "pathway_name": "   EB-2 NIW  ",
                "why_it_may_fit": " Strong merit-based fit for the current profile. ",
                "major_risks": ["  Evidence gap  ", "Evidence gap"],
                "estimated_complexity": "high",
                "estimated_timeline_category": "medium_term",
                "estimated_cost_category": "medium",
                "suitability_score": 82,
                "next_action": "   ",
            }
        ],
        missing_information=[],
        next_steps=[],
        confidence_label="low",
    )

    result = normalizer.normalize(
        case_id=str(uuid4()),
        output=raw_output,
        fallback_missing_information=["Nationality is missing."],
    )

    assert result.normalization_applied is True
    assert result.output.summary
    assert result.output.plans[0].label == "Plan A"
    assert result.output.plans[0].next_action
    assert result.output.plans[0].major_risks == ["Evidence gap"]
    assert result.output.missing_information == ["Nationality is missing."]
    assert result.output.next_steps


def test_strategy_confidence_service_returns_insufficient_information_when_gaps_are_high() -> None:
    confidence_service = StrategyConfidenceService()

    evaluation = SimpleNamespace(
        critical_items=[
            "Nationality missing.",
            "Target country missing.",
            "Education missing.",
            "English missing.",
            "Visa history missing.",
        ],
        helpful_items=["Timeline missing."],
        profile_completeness_ratio=28.0,
        case_completeness_ratio=20.0,
    )

    result = confidence_service.evaluate(
        missing_information=evaluation,
        grounding_used=False,
        plan_count=0,
        normalization_issue_count=2,
    )

    assert result.confidence_label == ConfidenceLabel.INSUFFICIENT_INFORMATION
    assert result.confidence_score < 40
    assert result.confidence_reasons
