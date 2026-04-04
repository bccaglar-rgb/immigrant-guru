from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    EducationLevel,
    EnglishLevel,
    MaritalStatus,
    RelocationTimeline,
)

PROFILE_EXAMPLE = {
    "first_name": "Aylin",
    "last_name": "Demir",
    "nationality": "Turkish",
    "current_country": "Canada",
    "target_country": "United States",
    "marital_status": "married",
    "children_count": 1,
    "education_level": "master",
    "english_level": "advanced",
    "profession": "Software Engineer",
    "years_of_experience": 8,
    "available_capital": "75000.00",
    "criminal_record_flag": False,
    "prior_visa_refusal_flag": False,
    "relocation_timeline": "within_6_months",
    "preferred_language": "en"
}


class UserProfileAttributes(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    nationality: str | None = Field(default=None, max_length=100)
    current_country: str | None = Field(default=None, max_length=100)
    target_country: str | None = Field(default=None, max_length=100)
    marital_status: MaritalStatus | None = None
    children_count: int | None = Field(default=None, ge=0, le=20)
    education_level: EducationLevel | None = None
    english_level: EnglishLevel | None = None
    profession: str | None = Field(default=None, max_length=150)
    years_of_experience: int | None = Field(default=None, ge=0, le=80)
    available_capital: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=2,
    )
    criminal_record_flag: bool | None = None
    prior_visa_refusal_flag: bool | None = None
    relocation_timeline: RelocationTimeline | None = None
    preferred_language: str | None = Field(default=None, max_length=32)


class UserProfileCreate(UserProfileAttributes):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": PROFILE_EXAMPLE},
    )


class UserProfileUpdate(UserProfileAttributes):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": PROFILE_EXAMPLE},
    )


class UserProfileRead(UserProfileAttributes):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
