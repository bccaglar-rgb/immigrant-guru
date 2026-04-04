from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CaseTimelineStepRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_name: str = Field(min_length=1, max_length=160)
    estimated_duration_months: float = Field(ge=0, le=240)
    description: str = Field(min_length=1, max_length=500)


class CaseTimelineRead(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "case_id": "0b545f2b-6f53-498c-8f2f-3b20a9df8f74",
                "target_country": "Canada",
                "target_program": "Express Entry",
                "timeline_version": "deterministic_v1",
                "disclaimer": "This is a deterministic planning timeline estimate. It supports preparation decisions and does not guarantee government processing times.",
                "total_estimated_duration_months": 11.5,
                "steps": [
                    {
                        "step_name": "Eligibility review and profile positioning",
                        "estimated_duration_months": 1.6,
                        "description": "Confirm pathway fit, close high-impact profile gaps, and define the evidence strategy before formal preparation."
                    },
                    {
                        "step_name": "Government processing and review",
                        "estimated_duration_months": 5.5,
                        "description": "Wait through the main agency review period, including queueing, document review, and possible clarification requests."
                    }
                ],
                "delay_risks": [
                    "Critical profile or case gaps can delay document preparation and filing readiness."
                ],
                "acceleration_tips": [
                    "Prepare language, education, and employment evidence early to shorten skilled-pathway preparation."
                ],
                "generated_at": "2026-04-03T23:59:00Z"
            }
        },
    )

    case_id: UUID
    target_country: str | None = Field(default=None, max_length=100)
    target_program: str | None = Field(default=None, max_length=120)
    timeline_version: str = "deterministic_v1"
    disclaimer: str
    total_estimated_duration_months: float = Field(ge=0, le=240)
    steps: list[CaseTimelineStepRead] = Field(default_factory=list, max_length=12)
    delay_risks: list[str] = Field(default_factory=list, max_length=8)
    acceleration_tips: list[str] = Field(default_factory=list, max_length=8)
    generated_at: datetime
