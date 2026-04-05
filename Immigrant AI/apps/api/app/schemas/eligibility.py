from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EligibilityOperator(str, Enum):
    EQ = "eq"
    NEQ = "neq"
    IN = "in"
    NOT_IN = "not_in"
    GTE = "gte"
    LTE = "lte"
    GT = "gt"
    LT = "lt"
    CONTAINS = "contains"
    EXISTS = "exists"
    TRUTHY = "truthy"
    FALSY = "falsy"


class EligibilityRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str = Field(min_length=1, max_length=120)
    operator: EligibilityOperator
    value: Any | None = None
    label: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def validate_value_requirement(self) -> "EligibilityRule":
        if self.operator in {
            EligibilityOperator.EQ,
            EligibilityOperator.NEQ,
            EligibilityOperator.IN,
            EligibilityOperator.NOT_IN,
            EligibilityOperator.GTE,
            EligibilityOperator.LTE,
            EligibilityOperator.GT,
            EligibilityOperator.LT,
            EligibilityOperator.CONTAINS,
        } and self.value is None:
            raise ValueError("value is required for the selected operator")

        return self


class DeterministicEligibilityRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "user_profile": {
                    "education_level": "master",
                    "years_of_experience": 6,
                    "english_level": "advanced",
                    "criminal_record_flag": False,
                    "available_capital": 75000
                },
                "visa_requirements": {
                    "required_rules": [
                        {
                            "field": "education_level",
                            "operator": "in",
                            "value": ["bachelor", "master", "doctorate"],
                            "label": "A qualifying degree is required."
                        },
                        {
                            "field": "years_of_experience",
                            "operator": "gte",
                            "value": 5,
                            "label": "At least 5 years of experience is required."
                        }
                    ],
                    "disqualifier_rules": [
                        {
                            "field": "criminal_record_flag",
                            "operator": "eq",
                            "value": True,
                            "label": "A disqualifying criminal record was provided."
                        }
                    ],
                    "strength_rules": [
                        {
                            "field": "english_level",
                            "operator": "in",
                            "value": ["advanced", "fluent", "native"],
                            "label": "Strong English level improves this case."
                        }
                    ]
                }
            }
        },
    )

    user_profile: dict[str, Any] = Field(default_factory=dict)
    visa_requirements: dict[str, list[EligibilityRule]] = Field(default_factory=dict)


class DeterministicEligibilityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eligible: bool
    missing_requirements: list[str] = Field(default_factory=list)
    disqualifiers_triggered: list[str] = Field(default_factory=list)
    strength_score: float = Field(ge=0, le=100)
