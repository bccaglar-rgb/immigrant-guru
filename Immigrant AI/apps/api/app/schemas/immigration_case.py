from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ImmigrationCaseStatus

CASE_EXAMPLE = {
    "title": "U.S. employment-based migration plan",
    "target_country": "United States",
    "target_program": "EB-2 NIW",
    "current_stage": "eligibility_review",
    "status": "in_review",
    "notes": "Collect recommendation letters and evidence of impact.",
    "latest_score": "78.50",
    "risk_score": "22.00",
}


class ImmigrationCaseBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    target_country: str | None = Field(default=None, max_length=100)
    target_program: str | None = Field(default=None, max_length=120)
    current_stage: str | None = Field(default=None, max_length=120)
    status: ImmigrationCaseStatus = ImmigrationCaseStatus.DRAFT
    notes: str | None = None
    latest_score: Decimal | None = Field(
        default=None,
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
    )
    risk_score: Decimal | None = Field(
        default=None,
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
    )


class ImmigrationCaseCreate(ImmigrationCaseBase):
    model_config = ConfigDict(extra="forbid", json_schema_extra={"example": CASE_EXAMPLE})


class ImmigrationCaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", json_schema_extra={"example": CASE_EXAMPLE})

    title: str | None = Field(default=None, min_length=1, max_length=255)
    target_country: str | None = Field(default=None, max_length=100)
    target_program: str | None = Field(default=None, max_length=120)
    current_stage: str | None = Field(default=None, max_length=120)
    status: ImmigrationCaseStatus | None = None
    notes: str | None = None
    latest_score: Decimal | None = Field(
        default=None,
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
    )
    risk_score: Decimal | None = Field(
        default=None,
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
    )


class ImmigrationCaseSummary(ImmigrationCaseBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class ImmigrationCaseRead(ImmigrationCaseSummary):
    user_id: UUID
