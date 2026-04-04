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
        ("get", "/api/v1/cases", None),
        ("post", "/api/v1/cases", {"title": "Case A"}),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001", None),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/score", None),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/workspace", None),
        ("get", "/api/v1/cases/00000000-0000-0000-0000-000000000001/documents", None),
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


def test_case_schema_rejects_invalid_scores() -> None:
    with pytest.raises(ValidationError):
        ImmigrationCaseCreate(
            title="Case A",
            latest_score=101,
        )

    with pytest.raises(ValidationError):
        ImmigrationCaseUpdate(risk_score=-1)
