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
from app.services.knowledge_embedding_service import HashingKnowledgeEmbeddingProvider
from app.services.knowledge_retrieval_service import (
    HybridKnowledgeRetriever,
    LexicalKnowledgeRetriever,
)

client = TestClient(app)


class StubKnowledgeBaseService:
    def __init__(self, chunks: list[KnowledgeChunk]) -> None:
        self._chunks = chunks

    async def retrieve_candidate_chunks(self, *args, **kwargs) -> list[KnowledgeChunk]:
        return self._chunks

    async def retrieve_vector_candidate_chunks(self, *args, **kwargs) -> list[tuple[KnowledgeChunk, float]]:
        ranked: list[tuple[KnowledgeChunk, float]] = []
        for chunk in self._chunks:
            if chunk.embedding is None:
                continue
            ranked.append((chunk, 0.92 if "degree" in chunk.chunk_text.lower() else 0.41))
        return ranked


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
        embedding=None,
        embedding_provider=None,
        embedding_model=None,
        embedding_dimension=None,
        embedding_updated_at=None,
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


@pytest.mark.asyncio
async def test_hybrid_retrieval_combines_lexical_and_vector_signals() -> None:
    now = datetime.now(timezone.utc)
    strong_chunk = make_chunk(
        source_name="USCIS H-1B Specialty Occupations",
        authority_level=KnowledgeAuthorityLevel.PRIMARY,
        verified_at=now - timedelta(days=5),
        chunk_text="Specialty occupation roles generally require a bachelor's degree or equivalent.",
    )
    weak_chunk = make_chunk(
        source_name="Forum summary",
        authority_level=KnowledgeAuthorityLevel.TERTIARY,
        verified_at=now - timedelta(days=120),
        chunk_text="General H-1B notes without strong requirement detail.",
    )
    embedding_provider = HashingKnowledgeEmbeddingProvider(dimensions=32)
    strong_chunk.embedding = (await embedding_provider.embed_text(strong_chunk.chunk_text)).values
    weak_chunk.embedding = (await embedding_provider.embed_text(weak_chunk.chunk_text)).values

    retriever = HybridKnowledgeRetriever(
        knowledge_base_service=StubKnowledgeBaseService([weak_chunk, strong_chunk]),
        embedding_provider=embedding_provider,
        lexical_candidate_limit=20,
        vector_candidate_limit=20,
        rrf_k=50,
        lexical_weight=0.45,
        vector_weight=0.35,
        freshness_weight=0.10,
        authority_weight=0.10,
    )

    response = await retriever.search(
        session=None,  # type: ignore[arg-type]
        payload=KnowledgeSearchRequest(
            query="h1b specialty occupation degree requirement",
            country="United States",
            visa_type="H-1B",
            retrieval_mode="hybrid",
            limit=5,
        ),
    )

    assert response.backend == "hybrid"
    assert response.results[0].source.source_name == "USCIS H-1B Specialty Occupations"
    assert response.results[0].vector_score > 0
    assert response.results[0].hybrid_score >= response.results[0].lexical_score


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
