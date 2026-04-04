from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PathwayProbabilityConfidenceLevel


class PathwayProbabilityRead(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "case_id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
                "target_country": "Canada",
                "target_program": "Express Entry",
                "scoring_version": "deterministic_v1",
                "disclaimer": "This is a deterministic product probability estimate for planning support. It is not legal advice or an approval guarantee.",
                "probability_score": 71.4,
                "confidence_level": "MEDIUM",
                "strengths": [
                    "Professional profile depth supports a skilled-pathway evaluation.",
                    "Core destination and pathway direction are already defined."
                ],
                "weaknesses": [
                    "Some profile inputs are still missing, which reduces evaluation precision."
                ],
                "key_risk_factors": [
                    "Prior visa refusal history has not been fully confirmed."
                ],
                "improvement_actions": [
                    "Confirm any prior refusal history and supporting context.",
                    "Strengthen the highest-impact missing profile inputs first."
                ],
                "reasoning_summary": "The case shows a usable skilled-pathway profile with decent readiness, but remaining information gaps and unresolved risks keep the estimate below a high-confidence range.",
                "generated_at": "2026-04-03T22:00:00Z"
            }
        },
    )

    case_id: UUID
    target_country: str | None = Field(default=None, max_length=100)
    target_program: str | None = Field(default=None, max_length=120)
    scoring_version: str = "deterministic_v1"
    disclaimer: str
    probability_score: float = Field(ge=0, le=100)
    confidence_level: PathwayProbabilityConfidenceLevel
    strengths: list[str] = Field(default_factory=list, max_length=6)
    weaknesses: list[str] = Field(default_factory=list, max_length=6)
    key_risk_factors: list[str] = Field(default_factory=list, max_length=6)
    improvement_actions: list[str] = Field(default_factory=list, max_length=8)
    reasoning_summary: str = Field(min_length=1, max_length=1200)
    generated_at: datetime
