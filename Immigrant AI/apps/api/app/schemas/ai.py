from __future__ import annotations

from datetime import datetime
try:
    from enum import StrEnum
except ImportError:  # pragma: no cover - Python < 3.11 fallback for local tooling
    from enum import Enum

    class StrEnum(str, Enum):
        pass
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import KnowledgeAuthorityLevel, KnowledgeSourceType


class StrategyContextMode(StrEnum):
    CASE_AWARE = "case-aware"
    PROFILE_AWARE = "profile-aware"
    FULL = "full"


class ConfidenceLabel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    INSUFFICIENT_INFORMATION = "insufficient_information"


class StrategyPlanLabel(StrEnum):
    PLAN_A = "Plan A"
    PLAN_B = "Plan B"
    PLAN_C = "Plan C"


class EstimatedComplexity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class EstimatedTimelineCategory(StrEnum):
    SHORT_TERM = "short_term"
    MEDIUM_TERM = "medium_term"
    LONG_TERM = "long_term"


class EstimatedCostCategory(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ProbabilityConfidenceLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ActionPriorityLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ComparisonCostLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ComparisonDifficultyLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class StrategyPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: StrategyPlanLabel
    pathway_name: str = Field(min_length=1, max_length=160)
    why_it_may_fit: str = Field(min_length=1, max_length=2000)
    major_risks: list[str] = Field(default_factory=list, max_length=5)
    estimated_complexity: EstimatedComplexity
    estimated_timeline_category: EstimatedTimelineCategory
    estimated_cost_category: EstimatedCostCategory
    suitability_score: float = Field(ge=0, le=100)
    next_action: str = Field(min_length=1, max_length=500)


class AIStrategyRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "case_id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
                "question": "What is my best immigration route?",
                "context_mode": "case-aware",
                "use_grounding": True,
            }
        },
    )

    case_id: UUID
    question: str = Field(min_length=10, max_length=2000)
    context_mode: StrategyContextMode = StrategyContextMode.CASE_AWARE
    use_grounding: bool = True


class AIStrategyModelOutput(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "summary": "A merit-based employment route appears strongest, with skilled migration and study-to-work routes as secondary options.",
                "plans": [
                    {
                        "label": "Plan A",
                        "pathway_name": "EB-2 NIW",
                        "why_it_may_fit": "The profile shows advanced education and meaningful professional experience, which may support a merit-based route if evidence is strong.",
                        "major_risks": [
                            "Evidence of national interest impact may need strengthening."
                        ],
                        "estimated_complexity": "high",
                        "estimated_timeline_category": "medium_term",
                        "estimated_cost_category": "medium",
                        "suitability_score": 82,
                        "next_action": "Audit current evidence against the target program requirements."
                    }
                ],
                "missing_information": [
                    "Comparable evidence of national or sector-level impact is still missing."
                ],
                "next_steps": [
                    "Map current documents and evidence to the strongest pathway first."
                ],
                "confidence_label": "medium",
            }
        },
    )

    summary: str = Field(min_length=1, max_length=4000)
    plans: list[StrategyPlan] = Field(default_factory=list, max_length=3)
    missing_information: list[str] = Field(default_factory=list, max_length=10)
    next_steps: list[str] = Field(default_factory=list, max_length=10)
    confidence_label: ConfidenceLabel

    @model_validator(mode="after")
    def validate_plan_order(self) -> "AIStrategyModelOutput":
        expected_labels = [
            StrategyPlanLabel.PLAN_A,
            StrategyPlanLabel.PLAN_B,
            StrategyPlanLabel.PLAN_C,
        ]
        actual_labels = [plan.label for plan in self.plans]

        if actual_labels != expected_labels[: len(actual_labels)]:
            raise ValueError("Plans must be sequentially labeled Plan A, Plan B, then Plan C.")

        return self


class AIStrategySourceAttribution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: UUID
    source_name: str = Field(min_length=1, max_length=255)
    source_type: KnowledgeSourceType
    country: str | None = Field(default=None, max_length=100)
    visa_type: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, max_length=32)
    authority_level: KnowledgeAuthorityLevel
    published_at: datetime | None = None
    verified_at: datetime | None = None


class MissingInformationSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    critical: list[str] = Field(default_factory=list, max_length=10)
    helpful: list[str] = Field(default_factory=list, max_length=10)


class AIStrategyResponse(AIStrategyModelOutput):
    model_config = ConfigDict(extra="forbid")

    case_id: UUID
    context_mode: StrategyContextMode
    provider: str
    model: str
    generated_at: datetime
    grounding_used: bool = False
    grounding_backend: str | None = None
    sources_used: list[AIStrategySourceAttribution] = Field(default_factory=list)
    missing_information_by_severity: MissingInformationSummary = Field(
        default_factory=MissingInformationSummary
    )
    confidence_score: float = Field(ge=0, le=100)
    confidence_reasons: list[str] = Field(default_factory=list, max_length=6)


class PathwayProbabilityRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "visa_type": "H-1B Specialty Occupation"
            }
        },
    )

    visa_type: str = Field(min_length=2, max_length=160)


class PathwayProbabilityResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "probability_score": 68,
                "confidence_level": "MEDIUM",
                "strengths": [
                    "Professional experience aligns with the target pathway."
                ],
                "weaknesses": [
                    "Available capital is not yet documented."
                ],
                "key_risk_factors": [
                    "Prior visa refusal history may weaken the case."
                ],
                "improvement_actions": [
                    "Clarify employment evidence and pathway-specific eligibility documents."
                ],
                "reasoning_summary": "This pathway appears plausible, but the current profile still has evidence and risk gaps that keep the success probability in a moderate range."
            }
        },
    )

    probability_score: int = Field(ge=0, le=100)
    confidence_level: ProbabilityConfidenceLevel
    strengths: list[str] = Field(default_factory=list, max_length=6)
    weaknesses: list[str] = Field(default_factory=list, max_length=6)
    key_risk_factors: list[str] = Field(default_factory=list, max_length=6)
    improvement_actions: list[str] = Field(default_factory=list, max_length=6)
    reasoning_summary: str = Field(min_length=1, max_length=1000)


class TimelineSimulationRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "visa_type": "Express Entry",
                "target_country": "Canada",
            }
        },
    )

    visa_type: str = Field(min_length=2, max_length=160)
    target_country: str = Field(min_length=2, max_length=100)


class TimelineSimulationStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_name: str = Field(min_length=1, max_length=160)
    estimated_duration_months: float = Field(ge=0, le=240)
    description: str = Field(min_length=1, max_length=500)


class TimelineSimulationResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "total_estimated_duration_months": 12,
                "steps": [
                    {
                        "step_name": "Preparation and document assembly",
                        "estimated_duration_months": 2,
                        "description": "Gather profile evidence, prepare pathway-specific documents, and close information gaps before filing."
                    }
                ],
                "delay_risks": [
                    "Missing evidence can delay the filing and review timeline."
                ],
                "acceleration_tips": [
                    "Prepare pathway-specific documents before the formal filing step."
                ]
            }
        },
    )

    total_estimated_duration_months: float = Field(ge=0, le=240)
    steps: list[TimelineSimulationStep] = Field(default_factory=list, max_length=12)
    delay_risks: list[str] = Field(default_factory=list, max_length=8)
    acceleration_tips: list[str] = Field(default_factory=list, max_length=8)


class AlternativeStrategyPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=32)
    pathway: str = Field(min_length=1, max_length=160)
    why_it_fits: str = Field(min_length=1, max_length=2000)
    probability: int = Field(ge=0, le=100)
    timeline_months: float = Field(ge=0, le=240)
    cost_estimate: str = Field(min_length=1, max_length=120)
    risks: list[str] = Field(default_factory=list, max_length=6)
    next_steps: list[str] = Field(default_factory=list, max_length=6)


class AlternativeStrategiesRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "target_country": "Canada",
            }
        },
    )

    target_country: str = Field(min_length=2, max_length=100)


class AlternativeStrategiesResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "plans": [
                    {
                        "name": "Plan A",
                        "pathway": "Express Entry",
                        "why_it_fits": "The profile aligns with a structured skilled migration route.",
                        "probability": 72,
                        "timeline_months": 14,
                        "cost_estimate": "Medium",
                        "risks": [
                            "Language or credential evidence can materially affect ranking."
                        ],
                        "next_steps": [
                            "Confirm language score and education credential strategy."
                        ],
                    }
                ],
                "recommended_plan": "Plan A",
                "confidence_score": 76,
            }
        },
    )

    plans: list[AlternativeStrategyPlan] = Field(default_factory=list, min_length=1, max_length=3)
    recommended_plan: str = Field(min_length=1, max_length=32)
    confidence_score: int = Field(ge=0, le=100)

    @model_validator(mode="after")
    def validate_plan_names(self) -> "AlternativeStrategiesResponse":
        expected_names = ["Plan A", "Plan B", "Plan C"]
        actual_names = [plan.name for plan in self.plans]

        if actual_names != expected_names[: len(actual_names)]:
            raise ValueError("Plans must be sequentially named Plan A, Plan B, then Plan C.")

        if self.recommended_plan not in actual_names:
            raise ValueError("recommended_plan must match one of the returned plan names.")

        return self


class CountryPathwayOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country: str = Field(min_length=2, max_length=100)
    visa_type: str = Field(min_length=2, max_length=160)


class CountryComparisonRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "options": [
                    {"country": "USA", "visa_type": "H-1B"},
                    {"country": "Canada", "visa_type": "Express Entry"},
                    {"country": "Germany", "visa_type": "EU Blue Card"},
                ]
            }
        },
    )

    options: list[CountryPathwayOption] = Field(min_length=2, max_length=6)


class CountryComparisonItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country: str = Field(min_length=2, max_length=100)
    pathway: str = Field(min_length=2, max_length=160)
    success_probability: int = Field(ge=0, le=100)
    estimated_time_months: float = Field(ge=0, le=240)
    cost_level: ComparisonCostLevel
    difficulty: ComparisonDifficultyLevel
    key_advantages: list[str] = Field(default_factory=list, max_length=6)
    key_disadvantages: list[str] = Field(default_factory=list, max_length=6)


class CountryComparisonResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "comparison": [
                    {
                        "country": "Canada",
                        "pathway": "Express Entry",
                        "success_probability": 74,
                        "estimated_time_months": 14,
                        "cost_level": "MEDIUM",
                        "difficulty": "MEDIUM",
                        "key_advantages": [
                            "Profile aligns with a structured skilled migration route."
                        ],
                        "key_disadvantages": [
                            "Ranking can weaken if language or credential evidence is limited."
                        ],
                    }
                ],
                "best_option": "Canada - Express Entry",
                "reasoning": "Canada appears strongest because the route is comparatively structured for a skilled profile and the execution burden is more manageable than the alternatives.",
            }
        },
    )

    comparison: list[CountryComparisonItem] = Field(default_factory=list, min_length=1, max_length=6)
    best_option: str = Field(min_length=1, max_length=200)
    reasoning: str = Field(min_length=1, max_length=1200)


class ActionPrioritizationRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "case_id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
                "missing_information": [
                    "English test score is not confirmed.",
                    "Proof of available capital is missing.",
                ],
            }
        },
    )

    case_id: UUID
    missing_information: list[str] = Field(default_factory=list, max_length=12)


class ActionPrioritizationResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "next_best_action": "Confirm the language test strategy and target score requirement.",
                "why_this_matters": "Language evidence materially affects eligibility strength, scoring, and plan ranking across multiple pathways.",
                "impact_level": "HIGH",
                "urgency": "HIGH",
            }
        },
    )

    next_best_action: str = Field(min_length=1, max_length=300)
    why_this_matters: str = Field(min_length=1, max_length=1000)
    impact_level: ActionPriorityLevel
    urgency: ActionPriorityLevel


class ProfileWeaknessRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": {}},
    )


class ProfileWeaknessItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    area: str = Field(min_length=1, max_length=120)
    severity: ActionPriorityLevel
    why_it_matters: str = Field(min_length=1, max_length=1000)
    how_to_improve: list[str] = Field(default_factory=list, max_length=6)


class ProfileWeaknessResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "weaknesses": [
                    {
                        "area": "Language evidence",
                        "severity": "HIGH",
                        "why_it_matters": "Verified language results often affect eligibility strength, ranking, and pathway flexibility.",
                        "how_to_improve": [
                            "Confirm the target language exam and score requirement.",
                            "Book the exam timeline early enough to support the case plan.",
                        ],
                    }
                ],
                "priority_focus": "Strengthen language evidence first because it can materially affect multiple pathways at once.",
            }
        },
    )

    weaknesses: list[ProfileWeaknessItem] = Field(default_factory=list, max_length=8)
    priority_focus: str = Field(min_length=1, max_length=500)


class DocumentAnalysisRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "document_type": "passport",
                "extracted_text": "Passport number AB1234567 ...",
            }
        },
    )

    document_type: str = Field(min_length=1, max_length=120)
    extracted_text: str = Field(min_length=20, max_length=20000)


class DocumentAnalysisResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "document_classification": "Passport identity document",
                "key_information": [
                    "Passport number appears present.",
                    "Identity and nationality details appear present.",
                ],
                "issues_detected": [
                    "Expiry date is not clearly identifiable from the extracted text."
                ],
                "missing_information": [
                    "A clearly extracted expiry date may still be needed."
                ],
                "improvement_suggestions": [
                    "Upload a clearer scan with the identity page fully visible."
                ],
            }
        },
    )

    document_classification: str = Field(min_length=1, max_length=200)
    key_information: list[str] = Field(default_factory=list, max_length=8)
    issues_detected: list[str] = Field(default_factory=list, max_length=8)
    missing_information: list[str] = Field(default_factory=list, max_length=8)
    improvement_suggestions: list[str] = Field(default_factory=list, max_length=8)


class CopilotMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str = Field(min_length=1, max_length=32)
    content: str = Field(min_length=1, max_length=2000)


class CopilotRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "case_id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
                "previous_messages": [
                    {"role": "user", "content": "What are my strongest options?"},
                    {"role": "assistant", "content": "Your skilled route looks stronger than the investor route right now."},
                ],
                "question": "What should I do next to improve my case?",
            }
        },
    )

    case_id: UUID
    previous_messages: list[CopilotMessage] = Field(default_factory=list, max_length=20)
    question: str = Field(min_length=3, max_length=2000)


class CopilotResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "answer": "Your next move should be to close the language evidence gap because it affects pathway strength and score quality across multiple options.",
                "suggested_actions": [
                    "Confirm the target language exam and score threshold for your strongest pathway.",
                    "Book the exam timeline early enough to support your case plan.",
                ],
                "related_risks": [
                    "Without verified language evidence, your comparative pathway strength remains more uncertain."
                ],
            }
        },
    )

    answer: str = Field(min_length=1, max_length=3000)
    suggested_actions: list[str] = Field(default_factory=list, max_length=8)
    related_risks: list[str] = Field(default_factory=list, max_length=8)
