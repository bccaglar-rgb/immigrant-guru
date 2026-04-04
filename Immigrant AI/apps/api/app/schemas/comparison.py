from __future__ import annotations

from datetime import datetime
try:
    from enum import StrEnum
except ImportError:  # pragma: no cover - Python < 3.11 fallback for local tooling
    from enum import Enum

    class StrEnum(str, Enum):
        pass
from pydantic import BaseModel, ConfigDict, Field


class ComparisonCostLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ComparisonDifficultyLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class CountryPathwayOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country: str = Field(min_length=2, max_length=100)
    pathway: str = Field(min_length=2, max_length=160)


class CountryComparisonRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "options": [
                    {"country": "Canada", "pathway": "Express Entry"},
                    {"country": "Germany", "pathway": "EU Blue Card"},
                    {"country": "United States", "pathway": "EB-2 NIW"},
                ]
            }
        },
    )

    options: list[CountryPathwayOption] = Field(min_length=2, max_length=8)


class CountryComparisonItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country: str = Field(min_length=2, max_length=100)
    pathway: str = Field(min_length=2, max_length=160)
    success_probability: float = Field(ge=0, le=100)
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
                        "success_probability": 74.0,
                        "estimated_time_months": 11.8,
                        "cost_level": "MEDIUM",
                        "difficulty": "MEDIUM",
                        "key_advantages": [
                            "The profile aligns with a structured skilled migration route.",
                            "Professional experience supports a points-based pathway."
                        ],
                        "key_disadvantages": [
                            "Ranking can weaken if language or credential evidence remains incomplete."
                        ]
                    }
                ],
                "best_option": "Canada - Express Entry",
                "reasoning": "Canada - Express Entry currently leads because it combines the strongest deterministic probability with a comparatively manageable timeline and execution burden.",
                "generated_at": "2026-04-04T03:10:00Z"
            }
        },
    )

    comparison: list[CountryComparisonItem] = Field(default_factory=list, min_length=1, max_length=8)
    best_option: str = Field(min_length=1, max_length=200)
    reasoning: str = Field(min_length=1, max_length=1200)
    generated_at: datetime
