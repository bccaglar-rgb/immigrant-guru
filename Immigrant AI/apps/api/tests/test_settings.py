import pytest

from app.core.config import DEFAULT_JWT_SECRET, Settings


def test_settings_normalize_admin_emails() -> None:
    settings = Settings(
        admin_emails=[
            " Admin@Example.com ",
            "admin@example.com",
            "OPS@example.com",
            "",
        ]
    )

    assert settings.admin_emails == ["admin@example.com", "ops@example.com"]


def test_settings_reject_default_jwt_secret_in_production() -> None:
    with pytest.raises(ValueError):
        Settings(
            app_env="production",
            jwt_secret_key=DEFAULT_JWT_SECRET,
        )


def test_settings_reject_short_jwt_secret_in_staging() -> None:
    with pytest.raises(ValueError):
        Settings(
            app_env="staging",
            jwt_secret_key="short-secret",
        )


def test_settings_reject_invalid_frontend_app_url() -> None:
    with pytest.raises(ValueError):
        Settings(
            frontend_app_url="immigrant.guru",
        )
