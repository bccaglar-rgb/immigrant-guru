from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.immigration_case import ImmigrationCaseCreate, ImmigrationCaseUpdate

client = TestClient(app)


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("post", "/api/v1/comparison", {"options": [{"country": "Canada", "pathway": "Express Entry"}, {"country": "Germany", "pathway": "EU Blue Card"}]}),
        ("get", "/api/v1/cases", None),
        ("post", "/api/v1/cases", {"title": "Case A"}),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001", None),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/score", None),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/probability", None),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/timeline", None),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/workspace", None),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/outcome", None),
        ("post", "/api/v1/cases/00000000-0000-0000-0000-000000000001/outcome", {"outcome": "approved"}),
        ("put", "/api/v1/cases/00000000-0000-0000-0000-000000000001/outcome", {"notes": "updated"}),
        ("post", "/api/v1/cases/00000000-0000-0000-0000-000000000001/simulation", {"profile_overrides": {"english_level": "advanced"}}),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/copilot/thread", None),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/documents", None),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/document-audit", None),
        ("post", "/api/v1/cases/00000000-0000-0000-0000-000000000001/copilot/messages", {"content": "What should I do next?"}),
        ("put", "/api/v1/cases/00000000-0000-0000-0000-000000000001", {"title": "Updated"}),
        ("delete", "/api/v1/cases/00000000-0000-0000-0000-000000000001", None),
    ],
)
def test_case_endpoints_require_authentication(
    method: str,
    path: str,
    payload: dict[str, str] | None,
) -> None:
    request = getattr(client, method)
    response = request(path, json=payload) if payload is not None else request(path)

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_document_upload_endpoint_requires_authentication() -> None:
    response = client.post(
        "/api/v1/cases/00000000-0000-0000-0000-000000000001/documents",
        files={"file": ("passport.pdf", b"test", "application/pdf")},
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_admin_outcomes_summary_requires_authentication() -> None:
    response = client.get("/api/v1/admin/outcomes/summary")

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_ai_feedback_endpoint_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/feedback",
        json={
            "case_id": "00000000-0000-0000-0000-000000000001",
            "feature": "strategy",
            "rating": "positive",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_case_schema_rejects_invalid_scores() -> None:
    with pytest.raises(ValidationError):
        ImmigrationCaseCreate(
            title="Case A",
            latest_score=101,
        )

    with pytest.raises(ValidationError):
        ImmigrationCaseUpdate(risk_score=-1)
