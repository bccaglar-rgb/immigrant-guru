from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.services.knowledge_base_service import KnowledgeBaseService
from app.services.knowledge_ingestion_service import KnowledgeIngestionService

client = TestClient(app)


@pytest.mark.parametrize(
    "path,payload",
    [
        (
            "/api/v1/admin/kb/sources",
            {
                "source_name": "USCIS H-1B Specialty Occupations",
                "source_type": "government_website",
                "country": "United States",
                "visa_type": "H-1B",
                "language": "en",
                "authority_level": "primary",
                "metadata": {"source_url": "https://www.uscis.gov"},
                "chunks": [],
            },
        ),
        (
            "/api/v1/admin/kb/chunks",
            {
                "source_id": "00000000-0000-0000-0000-000000000001",
                "chunk_index": 0,
                "chunk_text": "H-1B classification applies to specialty occupations.",
                "language": "en",
                "metadata": {"section_heading": "Overview"},
            },
        ),
    ],
)
def test_admin_kb_routes_require_authentication(path: str, payload: dict[str, object]) -> None:
    response = client.post(path, json=payload)

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_knowledge_ingestion_service_rejects_deep_metadata() -> None:
    service = KnowledgeIngestionService(knowledge_base_service=KnowledgeBaseService())

    with pytest.raises(HTTPException) as exc_info:
        service._validate_metadata(
            {
                "level1": {
                    "level2": {
                        "level3": {
                            "level4": {
                                "level5": "too-deep"
                            }
                        }
                    }
                }
            }
        )

    assert exc_info.value.status_code == 422
    assert "nesting is too deep" in str(exc_info.value.detail)
