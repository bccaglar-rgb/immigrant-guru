from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserStatus
from app.schemas.immigration_case import ImmigrationCaseSummary
from app.schemas.user_profile import UserProfileCreate, UserProfileRead


class UserCreate(BaseModel):
    email: EmailStr
    status: UserStatus = UserStatus.ACTIVE
    profile: UserProfileCreate | None = None


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    status: UserStatus
    created_at: datetime
    updated_at: datetime


class UserRead(UserSummary):
    profile: UserProfileRead | None = None
    immigration_cases: list[ImmigrationCaseSummary] = Field(default_factory=list)
