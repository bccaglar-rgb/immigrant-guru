from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AIFeedbackRating, AIFeature


class AIFeedbackCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "case_id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
                "feature": "strategy",
                "rating": "positive",
                "comment": "This was specific enough to be actionable.",
                "target_id": None
            }
        },
    )

    case_id: UUID
    feature: AIFeature
    rating: AIFeedbackRating
    comment: str | None = Field(default=None, max_length=1500)
    target_id: UUID | None = None


class AIFeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    user_id: UUID
    case_id: UUID
    feature: AIFeature
    rating: AIFeedbackRating
    comment: str | None = None
    target_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class AIFeedbackSummaryRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_feedback: int = Field(ge=0)
    positive_feedback: int = Field(ge=0)
    negative_feedback: int = Field(ge=0)
    by_feature: dict[str, int] = Field(default_factory=dict)
    recent_feedback: list[AIFeedbackRead] = Field(default_factory=list)
    generated_at: datetime
