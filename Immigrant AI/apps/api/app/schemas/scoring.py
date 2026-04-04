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


class ScoreImpact(StrEnum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class ScoreContribution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=120)
    points: float = Field(ge=-100, le=100)
    impact: ScoreImpact
    explanation: str = Field(min_length=1, max_length=500)


class ScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: float = Field(ge=0, le=100)
    weight: float = Field(gt=0, le=1)
    summary: str = Field(min_length=1, max_length=500)
    contributions: list[ScoreContribution] = Field(default_factory=list)


class ImmigrationScoreRead(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "case_id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
                "scoring_version": "v1",
                "disclaimer": "This is a product guidance score, not a legal determination.",
                "overall_score": 72.5,
                "profile_completeness": {
                    "score": 75.0,
                    "weight": 0.3,
                    "summary": "Most core profile inputs are present, but some strategy fields are still missing.",
                    "contributions": [
                        {
                            "label": "Core profile inputs",
                            "points": 75.0,
                            "impact": "positive",
                            "explanation": "9 of 12 core profile signals are available."
                        }
                    ],
                },
                "financial_readiness": {
                    "score": 60.0,
                    "weight": 0.2,
                    "summary": "Declared capital is present, but additional planning context would improve readiness.",
                    "contributions": []
                },
                "professional_strength": {
                    "score": 78.0,
                    "weight": 0.25,
                    "summary": "Professional profile looks competitive based on education, experience, and language inputs.",
                    "contributions": []
                },
                "case_readiness": {
                    "score": 70.0,
                    "weight": 0.25,
                    "summary": "Case structure is usable, though some pathway planning detail is still missing.",
                    "contributions": []
                },
                "overall_reasons": [
                    "Professional profile depth supports the current strategy picture.",
                    "Case planning detail is adequate but can be improved with richer notes and stage data."
                ],
                "generated_at": "2026-04-02T12:00:00Z"
            }
        },
    )

    case_id: UUID
    scoring_version: str = "v1"
    disclaimer: str
    overall_score: float = Field(ge=0, le=100)
    profile_completeness: ScoreBreakdown
    financial_readiness: ScoreBreakdown
    professional_strength: ScoreBreakdown
    case_readiness: ScoreBreakdown
    overall_reasons: list[str] = Field(default_factory=list, max_length=10)
    generated_at: datetime
