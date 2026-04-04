from fastapi import HTTPException
import pytest

from app.core.config import get_settings
from app.core.security import get_admin_user
from app.models.enums import UserStatus
from app.models.user import User


@pytest.mark.asyncio
async def test_get_admin_user_rejects_non_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])

    user = User(
        email="member@example.com",
        password_hash="hashed-password",
        status=UserStatus.ACTIVE,
    )

    with pytest.raises(HTTPException) as exc_info:
        await get_admin_user(current_user=user)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin access is required."


@pytest.mark.asyncio
async def test_get_admin_user_accepts_configured_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_emails", ["admin@example.com"])

    user = User(
        email="ADMIN@example.com",
        password_hash="hashed-password",
        status=UserStatus.ACTIVE,
    )

    resolved = await get_admin_user(current_user=user)

    assert resolved is user
