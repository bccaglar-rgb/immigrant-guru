from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    EducationLevel,
    EnglishLevel,
    PathwayProbabilityConfidenceLevel,
)


class ScenarioSimulationProfileOverrides(BaseModel):
    model_config = ConfigDict(extra="forbid")

    education_level: EducationLevel | None = None
    english_level: EnglishLevel | None = None
    available_capital: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=2,
    )
    years_of_experience: int | None = Field(default=None, ge=0, le=80)
    target_country: str | None = Field(default=None, max_length=100)


class ScenarioSimulationCaseOverrides(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_country: str | None = Field(default=None, max_length=100)
    target_program: str | None = Field(default=None, max_length=120)


class CaseSimulationRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "profile_overrides": {
                    "english_level": "advanced",
                    "education_level": "master",
                    "available_capital": "90000.00",
                    "years_of_experience": 6,
                }
            }
        },
    )

    profile_overrides: ScenarioSimulationProfileOverrides = Field(
        default_factory=ScenarioSimulationProfileOverrides
    )
    case_overrides: ScenarioSimulationCaseOverrides = Field(
        default_factory=ScenarioSimulationCaseOverrides
    )


class CaseSimulationSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    readiness_score: float = Field(ge=0, le=100)
    probability_score: float = Field(ge=0, le=100)
    timeline_months: float = Field(ge=0, le=240)
    confidence_level: PathwayProbabilityConfidenceLevel
    summary: str = Field(min_length=1, max_length=800)


class CaseSimulationDelta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    readiness_score_change: float = Field(ge=-100, le=100)
    probability_score_change: float = Field(ge=-100, le=100)
    timeline_months_change: float = Field(ge=-240, le=240)


class CaseSimulationImpactItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=500)
    tone: str = Field(pattern="^(positive|neutral|negative)$")


class CaseSimulationRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=160)
    detail: str = Field(min_length=1, max_length=500)
    impact_label: str = Field(pattern="^(High impact|Medium impact|Foundational)$")


class CaseSimulationResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "case_id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
                "disclaimer": "This is a planning simulation for product guidance. It is not legal advice or an approval guarantee.",
                "current": {
                    "readiness_score": 63.5,
                    "probability_score": 58.2,
                    "timeline_months": 12.4,
                    "confidence_level": "MEDIUM",
                    "summary": "The current profile is directionally viable, but a few inputs still hold back confidence and speed."
                },
                "simulated": {
                    "readiness_score": 74.5,
                    "probability_score": 68.2,
                    "timeline_months": 10.1,
                    "confidence_level": "HIGH",
                    "summary": "The simulated profile creates a stronger planning position with a shorter preparation path."
                },
                "delta": {
                    "readiness_score_change": 11.0,
                    "probability_score_change": 10.0,
                    "timeline_months_change": -2.3
                },
                "impact_summary": [
                    {
                        "id": "probability-up",
                        "summary": "This scenario materially improves the likely competitiveness of the current pathway.",
                        "tone": "positive"
                    }
                ],
                "recommended_improvements": [
                    {
                        "id": "english",
                        "title": "Raise English evidence strength",
                        "detail": "Improving English results is often the fastest way to improve competitiveness and reduce preparation drag.",
                        "impact_label": "High impact"
                    }
                ],
                "generated_at": "2026-04-04T12:00:00Z"
            }
        },
    )

    case_id: UUID
    disclaimer: str
    current: CaseSimulationSnapshot
    simulated: CaseSimulationSnapshot
    delta: CaseSimulationDelta
    impact_summary: list[CaseSimulationImpactItem] = Field(default_factory=list)
    recommended_improvements: list[CaseSimulationRecommendation] = Field(
        default_factory=list
    )
    generated_at: datetime
