from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import CopilotMessageRole


class CopilotMessageCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "content": "What should I focus on next to strengthen this case?"
            }
        },
    )

    content: str = Field(min_length=1, max_length=2000)


class CopilotThreadMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    thread_id: UUID
    case_id: UUID
    user_id: UUID
    role: CopilotMessageRole
    content: str = Field(min_length=1, max_length=4000)
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CopilotThreadRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    case_id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    messages: list[CopilotThreadMessageRead] = Field(default_factory=list)


class CopilotMessageExchangeRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thread: CopilotThreadRead
    user_message: CopilotThreadMessageRead
    assistant_message: CopilotThreadMessageRead
