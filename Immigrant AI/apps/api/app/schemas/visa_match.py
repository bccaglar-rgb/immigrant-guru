from __future__ import annotations

try:
    from enum import StrEnum
except ImportError:  # pragma: no cover - Python < 3.11 fallback for local tooling
    from enum import Enum

    class StrEnum(str, Enum):
        pass

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.eligibility import EligibilityRule


class VisaQuotaPressure(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class VisaBacklogLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class VisaMatchConfidenceLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class VisaMatchMarketContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quota_pressure: VisaQuotaPressure = VisaQuotaPressure.MEDIUM
    backlog_level: VisaBacklogLevel = VisaBacklogLevel.MEDIUM
    backlog_months: float | None = Field(default=None, ge=0, le=240)


class VisaMatchRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "user_profile": {
                    "education_level": "master",
                    "years_of_experience": 7,
                    "english_level": "advanced",
                    "criminal_record_flag": False,
                    "available_capital": 90000,
                },
                "visa_requirements": {
                    "required_rules": [
                        {
                            "field": "education_level",
                            "operator": "in",
                            "value": ["bachelor", "master", "doctorate"],
                            "label": "A qualifying degree is required.",
                        }
                    ],
                    "disqualifier_rules": [
                        {
                            "field": "criminal_record_flag",
                            "operator": "eq",
                            "value": True,
                            "label": "A disqualifying criminal record was provided.",
                        }
                    ],
                    "strength_rules": [
                        {
                            "field": "years_of_experience",
                            "operator": "gte",
                            "value": 5,
                            "label": "At least 5 years of relevant experience improves the match.",
                        }
                    ],
                },
                "market_context": {
                    "quota_pressure": "high",
                    "backlog_level": "medium",
                    "backlog_months": 10,
                },
            }
        },
    )

    user_profile: dict[str, Any] = Field(default_factory=dict)
    visa_requirements: dict[str, list[EligibilityRule]] = Field(default_factory=dict)
    market_context: VisaMatchMarketContext = Field(default_factory=VisaMatchMarketContext)


class VisaMatchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    match_score: float = Field(ge=0, le=100)
    confidence_level: VisaMatchConfidenceLevel
    reasoning: str = Field(min_length=1, max_length=600)
