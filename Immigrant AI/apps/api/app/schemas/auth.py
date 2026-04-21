from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserStatus
from app.schemas.user_profile import UserProfileCreate, UserProfileRead


class UserRegistrationRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    profile: UserProfileCreate | None = None


class RegistrationInitiatedResponse(BaseModel):
    requires_verification: bool = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class AuthenticatedUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    status: UserStatus
    plan: str = "free"
    email_verified: bool = False
    created_at: datetime
    updated_at: datetime
    profile: UserProfileRead | None = None
