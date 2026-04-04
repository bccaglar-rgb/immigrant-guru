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


class MissingInformationGroupRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    critical: list[str] = Field(default_factory=list)
    helpful: list[str] = Field(default_factory=list)


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


class CaseHealthRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    health_status: CaseHealthStatus
    health_score: float = Field(ge=0, le=100)
    issues: list[str] = Field(default_factory=list, max_length=12)
    recommended_next_focus: str = Field(min_length=1, max_length=200)


class CaseWorkspaceRead(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "case_id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
                "generated_at": "2026-04-03T18:30:00Z",
                "health": {
                    "health_status": "needs_attention",
                    "health_score": 63.0,
                    "issues": [
                        "Target pathway is not defined yet.",
                        "Two required documents are still missing."
                    ],
                    "recommended_next_focus": "Clarify the pathway and close the core document gap."
                },
                "next_best_action": {
                    "title": "Define the target pathway",
                    "reasoning": "A clear pathway is needed before document prep and strategy comparison become reliable.",
                    "priority": "immediate",
                    "timing_category": "now"
                },
                "missing_information": {
                    "critical": [
                        "Profession is missing, which weakens skilled pathway comparison."
                    ],
                    "helpful": [
                        "Case notes are empty, so supporting context is limited."
                    ]
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
    health: CaseHealthRead
    next_best_action: NextBestActionRead
    missing_information: MissingInformationGroupRead
    checklist_summary: DocumentChecklistSummaryRead
    checklist: list[DocumentChecklistItemRead] = Field(default_factory=list)
    roadmap: list[ActionRoadmapItemRead] = Field(default_factory=list)
