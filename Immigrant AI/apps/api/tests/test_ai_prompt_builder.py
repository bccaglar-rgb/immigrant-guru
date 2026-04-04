import pytest
from pydantic import ValidationError
from types import SimpleNamespace
from uuid import uuid4

from app.schemas.ai import (
    ActionPrioritizationResponse,
    AIStrategyModelOutput,
    AlternativeStrategiesResponse,
    CopilotResponse,
    CountryComparisonResponse,
    DocumentAnalysisResponse,
    PathwayProbabilityResponse,
    ProfileWeaknessResponse,
    TimelineSimulationResponse,
    StrategyContextMode,
)
from app.services.ai_prompt_builder import (
    ActionPrioritizationPromptBuilder,
    AlternativeStrategiesPromptBuilder,
    CopilotPromptBuilder,
    CountryComparisonPromptBuilder,
    DocumentAnalysisPromptBuilder,
    GroundingPromptReference,
    PathwayProbabilityPromptBuilder,
    ProfileWeaknessPromptBuilder,
    StrategyPromptBuilder,
    TimelineSimulationPromptBuilder,
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


def test_pathway_probability_prompt_builder_uses_strict_json_contract() -> None:
    builder = PathwayProbabilityPromptBuilder()

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
        available_capital="50000.00",
        criminal_record_flag=False,
        prior_visa_refusal_flag=None,
        relocation_timeline=None,
        preferred_language="en",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    prompt_bundle = builder.build(
        profile=fake_profile,
        visa_type="H-1B Specialty Occupation",
    )

    assert prompt_bundle.structured_context["visa_type"] == "H-1B Specialty Occupation"
    assert "You are an immigration evaluation engine." in prompt_bundle.system_prompt
    assert "STRICT JSON only" in prompt_bundle.system_prompt
    assert '"probability_score": 0-100' in prompt_bundle.user_prompt
    assert "- Nationality: Turkish" in prompt_bundle.user_prompt
    assert "- Criminal Record: No" in prompt_bundle.user_prompt
    assert "- Prior Visa Refusal: Unknown" in prompt_bundle.user_prompt
    assert "H-1B Specialty Occupation" in prompt_bundle.user_prompt


def test_pathway_probability_schema_requires_uppercase_confidence() -> None:
    with pytest.raises(ValidationError):
        PathwayProbabilityResponse(
            probability_score=60,
            confidence_level="medium",
            strengths=["Strong profile."],
            weaknesses=["Capital not provided."],
            key_risk_factors=["Prior refusal unknown."],
            improvement_actions=["Provide more evidence."],
            reasoning_summary="Moderate pathway outlook.",
        )


def test_timeline_simulation_prompt_builder_uses_strict_json_contract() -> None:
    builder = TimelineSimulationPromptBuilder()

    fake_profile = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        first_name=None,
        last_name=None,
        nationality="Turkish",
        current_country="Turkey",
        target_country="Canada",
        marital_status=None,
        children_count=None,
        education_level="bachelor",
        english_level="advanced",
        profession="Engineer",
        years_of_experience=6,
        available_capital="50000.00",
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
        relocation_timeline="within_12_months",
        preferred_language="en",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    prompt_bundle = builder.build(
        profile=fake_profile,
        visa_type="Express Entry",
        target_country="Canada",
    )

    assert prompt_bundle.structured_context["visa_type"] == "Express Entry"
    assert prompt_bundle.structured_context["target_country"] == "Canada"
    assert "timeline simulation engine" in prompt_bundle.system_prompt
    assert '"total_estimated_duration_months": number' in prompt_bundle.user_prompt
    assert "Visa Type: Express Entry" in prompt_bundle.user_prompt
    assert "Country: Canada" in prompt_bundle.user_prompt


def test_timeline_simulation_schema_requires_structured_steps() -> None:
    response = TimelineSimulationResponse(
        total_estimated_duration_months=12,
        steps=[
            {
                "step_name": "Preparation",
                "estimated_duration_months": 2,
                "description": "Gather documents and prepare the file.",
            }
        ],
        delay_risks=["Missing documents."],
        acceleration_tips=["Prepare documents early."],
    )

    assert response.total_estimated_duration_months == 12
    assert response.steps[0].step_name == "Preparation"


def test_country_comparison_prompt_builder_uses_strict_json_contract() -> None:
    builder = CountryComparisonPromptBuilder()

    fake_profile = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        first_name=None,
        last_name=None,
        nationality="Turkish",
        current_country="Turkey",
        target_country="Canada",
        marital_status=None,
        children_count=None,
        education_level="bachelor",
        english_level="advanced",
        profession="Engineer",
        years_of_experience=6,
        available_capital="50000.00",
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
        relocation_timeline="within_12_months",
        preferred_language="en",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    prompt_bundle = builder.build(
        profile=fake_profile,
        options=[
            {"country": "USA", "visa_type": "H-1B"},
            {"country": "Canada", "visa_type": "Express Entry"},
            {"country": "Germany", "visa_type": "EU Blue Card"},
        ],
    )

    assert "comparison engine" in prompt_bundle.system_prompt
    assert "STRICT JSON only" in prompt_bundle.system_prompt
    assert '"best_option": "..."' in prompt_bundle.user_prompt
    assert "- USA: H-1B" in prompt_bundle.user_prompt
    assert "- Canada: Express Entry" in prompt_bundle.user_prompt
    assert prompt_bundle.structured_context["options"][2]["country"] == "Germany"


def test_country_comparison_schema_requires_uppercase_levels() -> None:
    with pytest.raises(ValidationError):
        CountryComparisonResponse(
            comparison=[
                {
                    "country": "Canada",
                    "pathway": "Express Entry",
                    "success_probability": 70,
                    "estimated_time_months": 12,
                    "cost_level": "medium",
                    "difficulty": "HIGH",
                    "key_advantages": ["Structured route."],
                    "key_disadvantages": ["Needs strong profile."],
                }
            ],
            best_option="Canada - Express Entry",
            reasoning="Comparatively strongest option.",
        )


def test_alternative_strategies_prompt_builder_uses_strict_json_contract() -> None:
    builder = AlternativeStrategiesPromptBuilder()

    fake_profile = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        first_name=None,
        last_name=None,
        nationality="Turkish",
        current_country="Turkey",
        target_country="Canada",
        marital_status=None,
        children_count=None,
        education_level="bachelor",
        english_level="advanced",
        profession="Engineer",
        years_of_experience=6,
        available_capital="50000.00",
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
        relocation_timeline="within_12_months",
        preferred_language="en",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    prompt_bundle = builder.build(
        profile=fake_profile,
        target_country="Canada",
    )

    assert "senior immigration strategist" in prompt_bundle.system_prompt
    assert "STRICT JSON only" in prompt_bundle.system_prompt
    assert '"recommended_plan": "..."' in prompt_bundle.user_prompt
    assert '"confidence_score": 0-100' in prompt_bundle.user_prompt
    assert "Target Country: Canada" in prompt_bundle.user_prompt


def test_alternative_strategies_schema_requires_sequential_plan_names() -> None:
    with pytest.raises(ValidationError):
        AlternativeStrategiesResponse(
            plans=[
                {
                    "name": "Plan B",
                    "pathway": "Express Entry",
                    "why_it_fits": "Strong structured route.",
                    "probability": 70,
                    "timeline_months": 12,
                    "cost_estimate": "Medium",
                    "risks": ["Language score variance."],
                    "next_steps": ["Confirm credential path."],
                }
            ],
            recommended_plan="Plan B",
            confidence_score=72,
        )


def test_action_prioritization_prompt_builder_uses_strict_json_contract() -> None:
    builder = ActionPrioritizationPromptBuilder()

    fake_case = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        title="Canada skilled migration",
        target_country="Canada",
        target_program="Express Entry",
        current_stage="eligibility_review",
        status="in_review",
        notes="Need to confirm language evidence.",
        latest_score="74.00",
        risk_score="28.00",
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
        target_country="Canada",
        marital_status=None,
        children_count=None,
        education_level="bachelor",
        english_level="advanced",
        profession="Engineer",
        years_of_experience=6,
        available_capital="50000.00",
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
        relocation_timeline="within_12_months",
        preferred_language="en",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    prompt_bundle = builder.build(
        profile=fake_profile,
        case=fake_case,
        missing_information=["IELTS score is not confirmed."],
    )

    assert "action prioritization engine" in prompt_bundle.system_prompt
    assert "STRICT JSON only" in prompt_bundle.system_prompt
    assert '"next_best_action": "..."' in prompt_bundle.user_prompt
    assert '"impact_level": "LOW | MEDIUM | HIGH"' in prompt_bundle.user_prompt
    assert "IELTS score is not confirmed." in prompt_bundle.user_prompt
    assert '"status": "in_review"' in prompt_bundle.user_prompt


def test_action_prioritization_schema_requires_uppercase_priority_levels() -> None:
    with pytest.raises(ValidationError):
        ActionPrioritizationResponse(
            next_best_action="Confirm IELTS booking.",
            why_this_matters="Language evidence can materially change ranking.",
            impact_level="high",
            urgency="HIGH",
        )


def test_profile_weakness_prompt_builder_uses_strict_json_contract() -> None:
    builder = ProfileWeaknessPromptBuilder()

    fake_profile = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        first_name=None,
        last_name=None,
        nationality="Turkish",
        current_country="Turkey",
        target_country="Canada",
        marital_status=None,
        children_count=None,
        education_level="bachelor",
        english_level=None,
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

    prompt_bundle = builder.build(profile=fake_profile)

    assert "weakness analysis engine" in prompt_bundle.system_prompt
    assert "STRICT JSON only" in prompt_bundle.system_prompt
    assert '"priority_focus": "..."' in prompt_bundle.user_prompt
    assert '"severity": "LOW | MEDIUM | HIGH"' in prompt_bundle.user_prompt
    assert '"english_level": null' in prompt_bundle.user_prompt


def test_profile_weakness_schema_requires_uppercase_severity() -> None:
    with pytest.raises(ValidationError):
        ProfileWeaknessResponse(
            weaknesses=[
                {
                    "area": "Language evidence",
                    "severity": "medium",
                    "why_it_matters": "Language proof affects flexibility.",
                    "how_to_improve": ["Confirm the target test."],
                }
            ],
            priority_focus="Strengthen language proof first.",
        )


def test_document_analysis_prompt_builder_uses_strict_json_contract() -> None:
    builder = DocumentAnalysisPromptBuilder()

    prompt_bundle = builder.build(
        document_type="passport",
        extracted_text="Passport No AB1234567 Name Jane Doe Nationality Turkish Date of Birth 1990-05-01",
    )

    assert "document analysis engine" in prompt_bundle.system_prompt
    assert "STRICT JSON only" in prompt_bundle.system_prompt
    assert '"document_classification": "..."' in prompt_bundle.user_prompt
    assert "Document Type: passport" in prompt_bundle.user_prompt
    assert "Passport No AB1234567" in prompt_bundle.user_prompt


def test_document_analysis_schema_accepts_structured_response() -> None:
    response = DocumentAnalysisResponse(
        document_classification="Passport identity document",
        key_information=["Passport number appears present."],
        issues_detected=["Expiry date not clearly visible."],
        missing_information=["Clear expiry date extraction may still be needed."],
        improvement_suggestions=["Upload a clearer scan of the identity page."],
    )

    assert response.document_classification == "Passport identity document"


def test_copilot_prompt_builder_uses_strict_json_contract() -> None:
    builder = CopilotPromptBuilder()

    fake_case = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        title="Canada skilled migration",
        target_country="Canada",
        target_program="Express Entry",
        current_stage="eligibility_review",
        status="in_review",
        notes="Need to confirm language evidence.",
        latest_score="74.00",
        risk_score="28.00",
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
        target_country="Canada",
        marital_status=None,
        children_count=None,
        education_level="bachelor",
        english_level="advanced",
        profession="Engineer",
        years_of_experience=6,
        available_capital="50000.00",
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
        relocation_timeline="within_12_months",
        preferred_language="en",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    prompt_bundle = builder.build(
        profile=fake_profile,
        case=fake_case,
        previous_messages=[
            {"role": "user", "content": "What are my strongest options?"},
            {"role": "assistant", "content": "Your skilled route looks stronger right now."},
        ],
        question="What should I do next to improve my case?",
        context_snapshot={
            "score_summary": {"overall_score": 74},
            "next_best_action": {"title": "Collect language evidence"},
        },
    )

    assert "AI immigration copilot" in prompt_bundle.system_prompt
    assert "STRICT JSON only" in prompt_bundle.system_prompt
    assert '"answer": "..."' in prompt_bundle.user_prompt
    assert '"suggested_actions": ["..."]' in prompt_bundle.user_prompt
    assert "What should I do next to improve my case?" in prompt_bundle.user_prompt
    assert '"role": "user"' in prompt_bundle.user_prompt
    assert "Context Snapshot" in prompt_bundle.user_prompt


def test_copilot_schema_accepts_structured_response() -> None:
    response = CopilotResponse(
        answer="Your next move should be to close the language evidence gap first.",
        suggested_actions=["Confirm the target language test.", "Book the exam timeline early."],
        related_risks=["Without verified language evidence, pathway strength remains more uncertain."],
    )

    assert response.answer.startswith("Your next move")
