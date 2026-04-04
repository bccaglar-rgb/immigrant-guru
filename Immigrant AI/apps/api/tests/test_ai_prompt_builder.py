import pytest
from pydantic import ValidationError
from types import SimpleNamespace
from uuid import uuid4

from app.schemas.ai import AIStrategyModelOutput, StrategyContextMode
from app.services.ai_prompt_builder import (
    GroundingPromptReference,
    StrategyPromptBuilder,
)


def test_prompt_builder_tracks_missing_profile_and_case_fields() -> None:
    builder = StrategyPromptBuilder()

    fake_case = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        title="Canada skilled migration",
        target_country="Canada",
        target_program=None,
        current_stage=None,
        status="draft",
        notes=None,
        latest_score=None,
        risk_score=None,
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )
    fake_profile = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        first_name=None,
        last_name=None,
        nationality=None,
        current_country="Turkey",
        target_country="Canada",
        marital_status=None,
        children_count=None,
        education_level=None,
        english_level=None,
        profession="Engineer",
        years_of_experience=None,
        available_capital=None,
        criminal_record_flag=None,
        prior_visa_refusal_flag=None,
        relocation_timeline=None,
        preferred_language=None,
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    prompt_bundle = builder.build(
        case=fake_case,
        profile=fake_profile,
        question="What is my strongest pathway?",
        context_mode=StrategyContextMode.CASE_AWARE,
        critical_missing_information=["Nationality is missing."],
        helpful_missing_information=["Relocation timeline is missing."],
    )

    assert "nationality" in prompt_bundle.structured_context["missing_profile_fields"]
    assert "education level" in prompt_bundle.structured_context["missing_profile_fields"]
    assert "target program" in prompt_bundle.structured_context["missing_case_fields"]
    assert "missing_information" in prompt_bundle.system_prompt
    assert "next_steps" in prompt_bundle.system_prompt
    assert "Plan A" in prompt_bundle.system_prompt
    assert "up to 3 meaningful options" in prompt_bundle.system_prompt
    assert "Return JSON only" in prompt_bundle.system_prompt
    assert "Known missing profile fields" in prompt_bundle.user_prompt
    assert "Critical missing information: Nationality is missing." in prompt_bundle.user_prompt
    assert "Helpful missing information: Relocation timeline is missing." in prompt_bundle.user_prompt
    assert "Grounding references: none supplied." in prompt_bundle.user_prompt


def test_prompt_builder_includes_grounding_context_when_available() -> None:
    builder = StrategyPromptBuilder()

    fake_case = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        title="US skilled worker",
        target_country="United States",
        target_program="H-1B",
        current_stage="research",
        status="draft",
        notes=None,
        latest_score=None,
        risk_score=None,
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )
    fake_profile = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        first_name=None,
        last_name=None,
        nationality="Turkish",
        current_country="Turkey",
        target_country="United States",
        marital_status=None,
        children_count=None,
        education_level="bachelor",
        english_level="advanced",
        profession="Engineer",
        years_of_experience=6,
        available_capital=None,
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
        relocation_timeline="within_12_months",
        preferred_language="en",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    prompt_bundle = builder.build(
        case=fake_case,
        profile=fake_profile,
        question="Compare my best US work visa paths.",
        context_mode=StrategyContextMode.FULL,
        grounding_backend="lexical",
        grounded_references=[
            GroundingPromptReference(
                source_id=str(uuid4()),
                source_name="USCIS H-1B Specialty Occupations",
                source_type="government_website",
                country="United States",
                visa_type="H-1B",
                language="en",
                authority_level="primary",
                published_at="2026-03-01T00:00:00+00:00",
                verified_at="2026-04-01T00:00:00+00:00",
                relevance_score=0.91,
                match_reason="Matched key H-1B terms.",
                excerpt="H-1B classification applies to specialty occupations.",
            )
        ],
    )

    assert prompt_bundle.structured_context["grounding"]["enabled"] is True
    assert prompt_bundle.structured_context["grounding"]["backend"] == "lexical"
    assert "USCIS H-1B Specialty Occupations" in prompt_bundle.user_prompt
    assert "factual anchor" in prompt_bundle.system_prompt
    assert "Grounding references: 1 supplied via lexical backend." in prompt_bundle.user_prompt
    assert "Match reason: Matched key H-1B terms." in prompt_bundle.user_prompt


def test_ai_strategy_schema_requires_sequential_plan_labels() -> None:
    with pytest.raises(ValidationError):
        AIStrategyModelOutput(
            summary="Provisional strategy view.",
            plans=[
                {
                    "label": "Plan B",
                    "pathway_name": "Skilled Worker",
                    "why_it_may_fit": "Baseline fit.",
                    "major_risks": ["Missing profile detail."],
                    "estimated_complexity": "medium",
                    "estimated_timeline_category": "medium_term",
                    "estimated_cost_category": "medium",
                    "suitability_score": 60,
                    "next_action": "Collect missing profile inputs.",
                }
            ],
            missing_information=["Nationality"],
            next_steps=["Complete missing profile fields."],
            confidence_label="low",
        )
