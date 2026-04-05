from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import CaseOutcomeStatus


class CaseOutcomeCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "outcome": "approved",
                "duration_months": 11,
                "final_pathway": "EB-2 NIW",
                "decision_date": "2026-04-04T12:00:00Z",
                "notes": "Approved after strong evidence package."
            }
        },
    )

    outcome: CaseOutcomeStatus
    duration_months: int | None = Field(default=None, ge=0, le=600)
    final_pathway: str | None = Field(default=None, max_length=120)
    decision_date: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)


class CaseOutcomeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: CaseOutcomeStatus | None = None
    duration_months: int | None = Field(default=None, ge=0, le=600)
    final_pathway: str | None = Field(default=None, max_length=120)
    decision_date: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)


class CaseOutcomeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    case_id: UUID
    outcome: CaseOutcomeStatus
    duration_months: int | None = None
    final_pathway: str | None = None
    decision_date: datetime | None = None
    notes: str | None = None
    recorded_by_user_id: UUID | None = None
    recorded_at: datetime
    created_at: datetime
    updated_at: datetime


class CaseOutcomeSummaryRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_cases_with_outcomes: int = Field(ge=0)
    by_outcome: dict[str, int] = Field(default_factory=dict)
    by_pathway: dict[str, int] = Field(default_factory=dict)
    average_duration_months: float | None = Field(default=None, ge=0, le=600)
    generated_at: datetime
