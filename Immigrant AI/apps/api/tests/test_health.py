from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_route_returns_expected_shape() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200

    payload = response.json()

    assert payload == {"service": "Immigrant AI API", "status": "ok"}


def test_version_route_returns_expected_shape() -> None:
    response = client.get("/api/v1/version")

    assert response.status_code == 200

    payload = response.json()

    assert payload["name"] == "Immigrant AI API"
    assert payload["environment"] == "development"
    assert payload["version"] == "0.1.0"


def test_not_found_returns_consistent_error_payload() -> None:
    response = client.get("/api/v1/missing")

    assert response.status_code == 404
    assert response.headers["X-Request-ID"]

    payload = response.json()

    assert payload["error"]["code"] == "http_error"
    assert payload["error"]["message"] == "Not Found"
    assert payload["path"] == "/api/v1/missing"
    assert "request_id" in payload
