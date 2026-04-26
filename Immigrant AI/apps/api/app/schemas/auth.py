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


class EmailCodeRequest(BaseModel):
    """Send a 6-digit login/signup code to the email."""
    email: EmailStr


class EmailCodeVerifyRequest(BaseModel):
    """Exchange a 6-digit code for a JWT. Creates the user if new."""
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)


class GoogleAuthRequest(BaseModel):
    """Body for POST /auth/google. id_token is the Google ID JWT from the
    Sign-In flow on web/iOS/Android."""
    id_token: str = Field(min_length=20)


class AppleAuthRequest(BaseModel):
    """Body for POST /auth/apple. id_token is Apple's identityToken; first
    sign-in also returns the user's name once (Apple never resends), so we
    accept it here for profile bootstrap."""
    id_token: str = Field(min_length=20)
    first_name: str | None = Field(default=None, max_length=64)
    last_name: str | None = Field(default=None, max_length=64)


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
