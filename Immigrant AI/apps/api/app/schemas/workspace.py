from __future__ import annotations

from datetime import datetime
try:
    from enum import StrEnum
except ImportError:  # pragma: no cover - Python < 3.11 fallback for local tooling
    from enum import Enum

    class StrEnum(str, Enum):
        pass
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PathwayProbabilityConfidenceLevel


class ActionPriority(StrEnum):
    IMMEDIATE = "immediate"
    SOON = "soon"
    LATER = "later"


class TimingCategory(StrEnum):
    NOW = "now"
    THIS_WEEK = "this_week"
    THIS_MONTH = "this_month"
    LATER = "later"


class ChecklistRequirementLevel(StrEnum):
    REQUIRED = "required"
    RECOMMENDED = "recommended"


class ChecklistItemStatus(StrEnum):
    MISSING = "missing"
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    FAILED = "failed"


class CaseHealthStatus(StrEnum):
    STRONG = "strong"
    NEEDS_ATTENTION = "needs_attention"
    INCOMPLETE = "incomplete"
    AT_RISK = "at_risk"


class RiskSeverity(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RiskSource(StrEnum):
    PROBABILITY = "probability"
    TIMELINE = "timeline"
    DOCUMENTS = "documents"
    HEALTH = "health"


class MissingInformationSeverity(StrEnum):
    CRITICAL = "critical"
    HELPFUL = "helpful"


class MissingInformationGroupRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    critical: list[str] = Field(default_factory=list)
    helpful: list[str] = Field(default_factory=list)


class MissingInformationItemRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=140)
    severity: MissingInformationSeverity
    source: str = Field(min_length=1, max_length=40)
    message: str = Field(min_length=1, max_length=300)


class WorkspaceRiskRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=140)
    title: str = Field(min_length=1, max_length=140)
    severity: RiskSeverity
    source: RiskSource
    description: str = Field(min_length=1, max_length=400)


class NextBestActionRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=140)
    reasoning: str = Field(min_length=1, max_length=500)
    priority: ActionPriority
    timing_category: TimingCategory


class ActionRoadmapItemRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(min_length=1, max_length=500)
    priority: ActionPriority
    timing_category: TimingCategory
    dependency_notes: str | None = Field(default=None, max_length=300)


class DocumentChecklistItemRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=100)
    document_name: str = Field(min_length=1, max_length=140)
    category: str = Field(min_length=1, max_length=80)
    requirement_level: ChecklistRequirementLevel
    status: ChecklistItemStatus
    notes: str = Field(min_length=1, max_length=500)
    matched_document_id: UUID | None = None


class DocumentChecklistSummaryRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_items: int = Field(ge=0)
    required_items: int = Field(ge=0)
    completed_items: int = Field(ge=0)
    uploaded_items: int = Field(ge=0)
    processing_items: int = Field(ge=0)
    failed_items: int = Field(ge=0)
    missing_required_items: int = Field(ge=0)
    readiness_score: float = Field(ge=0, le=100)


class DocumentStatusSummaryRead(DocumentChecklistSummaryRead):
    model_config = ConfigDict(extra="forbid")

    attention_required: bool
    summary: str = Field(min_length=1, max_length=300)


class CaseHealthRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    health_status: CaseHealthStatus
    health_score: float = Field(ge=0, le=100)
    issues: list[str] = Field(default_factory=list, max_length=12)
    recommended_next_focus: str = Field(min_length=1, max_length=200)


class ReadinessScoreSummaryRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall_score: float = Field(ge=0, le=100)
    label: str = Field(min_length=1, max_length=40)
    summary: str = Field(min_length=1, max_length=300)
    profile_completeness_score: float = Field(ge=0, le=100)
    financial_readiness_score: float = Field(ge=0, le=100)
    professional_strength_score: float = Field(ge=0, le=100)
    case_readiness_score: float = Field(ge=0, le=100)


class ProbabilitySummaryRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    probability_score: float = Field(ge=0, le=100)
    confidence_level: PathwayProbabilityConfidenceLevel
    summary: str = Field(min_length=1, max_length=400)
    strengths: list[str] = Field(default_factory=list, max_length=3)
    weaknesses: list[str] = Field(default_factory=list, max_length=3)


class TimelineSummaryRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_estimated_duration_months: float = Field(ge=0, le=240)
    next_step: str | None = Field(default=None, max_length=160)
    next_step_duration_months: float | None = Field(default=None, ge=0, le=240)
    delay_risks: list[str] = Field(default_factory=list, max_length=4)
    acceleration_tips: list[str] = Field(default_factory=list, max_length=4)


class RecommendedPathwayRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_country: str | None = Field(default=None, max_length=100)
    pathway: str | None = Field(default=None, max_length=120)
    confidence_level: PathwayProbabilityConfidenceLevel | None = None
    rationale: str = Field(min_length=1, max_length=400)


class CaseWorkspaceRead(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "case_id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
                "generated_at": "2026-04-03T18:30:00Z",
                "readiness_score": {
                    "overall_score": 71.4,
                    "label": "On track",
                    "summary": "The case is directionally viable, but a few missing inputs still limit execution confidence.",
                    "profile_completeness_score": 75.0,
                    "financial_readiness_score": 60.0,
                    "professional_strength_score": 82.0,
                    "case_readiness_score": 69.0
                },
                "probability_summary": {
                    "probability_score": 68.0,
                    "confidence_level": "MEDIUM",
                    "summary": "The current profile supports a workable pathway, but unresolved evidence and risk items still reduce certainty.",
                    "strengths": [
                        "Professional profile depth supports the current path."
                    ],
                    "weaknesses": [
                        "Some profile inputs are still missing."
                    ]
                },
                "timeline_summary": {
                    "total_estimated_duration_months": 11.5,
                    "next_step": "Eligibility review and profile positioning",
                    "next_step_duration_months": 1.2,
                    "delay_risks": [
                        "Critical profile or case gaps can delay document preparation and filing readiness."
                    ],
                    "acceleration_tips": [
                        "Resolve the highest-impact missing profile fields before collecting pathway-specific evidence."
                    ]
                },
                "top_risks": [
                    {
                        "id": "probability_1",
                        "title": "Profile or case gaps are still blocking confidence",
                        "severity": "high",
                        "source": "probability",
                        "description": "Critical profile or case gaps can delay document preparation and filing readiness."
                    }
                ],
                "missing_information": [
                    {
                        "id": "critical_1",
                        "severity": "critical",
                        "source": "profile",
                        "message": "Profession is missing, which weakens skilled pathway comparison."
                    }
                ],
                "next_best_action": {
                    "title": "Define the target pathway",
                    "reasoning": "A clear pathway is needed before document prep and strategy comparison become reliable.",
                    "priority": "immediate",
                    "timing_category": "now"
                },
                "document_status_summary": {
                    "total_items": 6,
                    "required_items": 4,
                    "completed_items": 2,
                    "uploaded_items": 2,
                    "processing_items": 1,
                    "failed_items": 0,
                    "missing_required_items": 2,
                    "readiness_score": 58.0,
                    "attention_required": True,
                    "summary": "Two required document items still need coverage."
                },
                "recommended_pathway": {
                    "target_country": "United States",
                    "pathway": "EB-2 NIW",
                    "confidence_level": "MEDIUM",
                    "rationale": "The case already points to a clear skilled pathway direction, but stronger evidence is still needed."
                },
                "case_health": {
                    "health_status": "needs_attention",
                    "health_score": 63.0,
                    "issues": [
                        "Target pathway is not defined yet.",
                        "Two required documents are still missing."
                    ],
                    "recommended_next_focus": "Clarify the pathway and close the core document gap."
                },
                "action_roadmap": [],
                "missing_information_grouped": {
                    "critical": [
                        "Profession is missing, which weakens skilled pathway comparison."
                    ],
                    "helpful": [
                        "Case notes are empty, so supporting context is limited."
                    ]
                },
                "health": {
                    "health_status": "needs_attention",
                    "health_score": 63.0,
                    "issues": [
                        "Target pathway is not defined yet.",
                        "Two required documents are still missing."
                    ],
                    "recommended_next_focus": "Clarify the pathway and close the core document gap."
                },
                "checklist_summary": {
                    "total_items": 6,
                    "required_items": 4,
                    "completed_items": 2,
                    "uploaded_items": 2,
                    "processing_items": 1,
                    "failed_items": 0,
                    "missing_required_items": 2,
                    "readiness_score": 58.0
                },
                "checklist": [],
                "roadmap": []
            }
        },
    )

    case_id: UUID
    generated_at: datetime
    readiness_score: ReadinessScoreSummaryRead
    probability_summary: ProbabilitySummaryRead
    timeline_summary: TimelineSummaryRead
    top_risks: list[WorkspaceRiskRead] = Field(default_factory=list)
    missing_information: list[MissingInformationItemRead] = Field(default_factory=list)
    next_best_action: NextBestActionRead
    document_status_summary: DocumentStatusSummaryRead
    recommended_pathway: RecommendedPathwayRead
    case_health: CaseHealthRead
    action_roadmap: list[ActionRoadmapItemRead] = Field(default_factory=list)

    # Compatibility fields for existing clients.
    health: CaseHealthRead
    missing_information_grouped: MissingInformationGroupRead
    checklist_summary: DocumentChecklistSummaryRead
    checklist: list[DocumentChecklistItemRead] = Field(default_factory=list)
    roadmap: list[ActionRoadmapItemRead] = Field(default_factory=list)
