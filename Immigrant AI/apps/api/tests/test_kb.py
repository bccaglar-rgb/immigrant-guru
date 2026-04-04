from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.models.enums import (
    KnowledgeAuthorityLevel,
    KnowledgeSourceType,
)
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_source import KnowledgeSource
from app.schemas.knowledge import KnowledgeSearchRequest
from app.services.knowledge_retrieval_service import LexicalKnowledgeRetriever

client = TestClient(app)


class StubKnowledgeBaseService:
    def __init__(self, chunks: list[KnowledgeChunk]) -> None:
        self._chunks = chunks

    async def retrieve_candidate_chunks(self, *args, **kwargs) -> list[KnowledgeChunk]:
        return self._chunks


def make_chunk(
    *,
    source_name: str,
    authority_level: KnowledgeAuthorityLevel,
    verified_at: datetime,
    chunk_text: str,
    visa_type: str = "H-1B",
    country: str = "United States",
) -> KnowledgeChunk:
    now = datetime.now(timezone.utc)
    source = KnowledgeSource(
        id=uuid4(),
        source_name=source_name,
        source_type=KnowledgeSourceType.GOVERNMENT_WEBSITE,
        country=country,
        visa_type=visa_type,
        language="en",
        authority_level=authority_level,
        verified_at=verified_at,
        metadata_json={},
        created_at=now,
        updated_at=now,
    )
    chunk = KnowledgeChunk(
        id=uuid4(),
        source_id=source.id,
        chunk_index=0,
        chunk_text=chunk_text,
        language="en",
        metadata_json={},
        created_at=now,
        updated_at=now,
    )
    chunk.source = source
    return chunk


@pytest.mark.asyncio
async def test_lexical_retrieval_prioritizes_relevance_authority_and_freshness() -> None:
    now = datetime.now(timezone.utc)
    primary_recent = make_chunk(
        source_name="USCIS H-1B Specialty Occupations",
        authority_level=KnowledgeAuthorityLevel.PRIMARY,
        verified_at=now - timedelta(days=10),
        chunk_text=(
            "Specialty occupation roles generally require a bachelor's degree "
            "or equivalent in a specific field."
        ),
    )
    secondary_stale = make_chunk(
        source_name="Older immigration blog",
        authority_level=KnowledgeAuthorityLevel.SECONDARY,
        verified_at=now - timedelta(days=900),
        chunk_text=(
            "The H-1B degree requirement may apply to specialty occupation "
            "positions in some cases."
        ),
    )

    retriever = LexicalKnowledgeRetriever(
        knowledge_base_service=StubKnowledgeBaseService(
            [secondary_stale, primary_recent]
        ),
        candidate_limit=10,
    )

    response = await retriever.search(
        session=None,  # type: ignore[arg-type]
        payload=KnowledgeSearchRequest(
            query="h1b specialty occupation degree requirement",
            country="United States",
            visa_type="H-1B",
            limit=5,
        ),
    )

    assert response.backend == "lexical"
    assert response.total_results == 2
    assert response.results[0].source.source_name == "USCIS H-1B Specialty Occupations"
    assert response.results[0].score >= response.results[1].score
    assert "degree" in response.results[0].matched_terms


def test_kb_search_requires_authentication() -> None:
    response = client.post(
        "/api/v1/kb/search",
        json={
            "query": "specialty occupation degree requirement",
            "country": "United States",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."
