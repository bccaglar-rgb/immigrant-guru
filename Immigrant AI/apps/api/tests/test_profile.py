import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.user_profile import UserProfileUpdate

client = TestClient(app)


def test_profile_me_requires_authentication() -> None:
    response = client.get("/api/v1/profile/me")

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_profile_update_requires_authentication() -> None:
    response = client.put(
        "/api/v1/profile/me",
        json={"nationality": "Turkish"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_profile_update_rejects_negative_numeric_values() -> None:
    with pytest.raises(ValidationError):
        UserProfileUpdate(children_count=-1)

    with pytest.raises(ValidationError):
        UserProfileUpdate(years_of_experience=-2)
