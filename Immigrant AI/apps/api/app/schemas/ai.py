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
