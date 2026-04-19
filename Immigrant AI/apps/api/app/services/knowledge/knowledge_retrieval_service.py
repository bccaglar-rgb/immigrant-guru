from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math
import re
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.enums import KnowledgeAuthorityLevel
from app.models.knowledge_chunk import KnowledgeChunk
from app.schemas.knowledge import (
    KnowledgeRetrievalQuery,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    KnowledgeSearchResult,
)
from app.services.knowledge.knowledge_base_service import KnowledgeBaseService
from app.services.knowledge.knowledge_embedding_service import (
    build_knowledge_embedding_provider,
    KnowledgeEmbeddingProvider,
)

TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "what",
    "with",
    "your",
}


@dataclass(frozen=True)
class RetrievalScoredChunk:
    chunk: KnowledgeChunk
    score: float
    lexical_score: float
    vector_score: float
    hybrid_score: float
    freshness_score: float
    authority_score: float
    matched_terms: list[str]
    match_reason: str


class KnowledgeRetriever(Protocol):
    backend_name: str

    async def search(
        self,
        *,
        session: AsyncSession,
        payload: KnowledgeSearchRequest,
    ) -> KnowledgeSearchResponse: ...


class LexicalKnowledgeRetriever:
    backend_name = "lexical"

    def __init__(
        self,
        *,
        knowledge_base_service: KnowledgeBaseService,
        candidate_limit: int,
    ) -> None:
        self._knowledge_base_service = knowledge_base_service
        self._candidate_limit = max(candidate_limit, 10)

    async def search(
        self,
        *,
        session: AsyncSession,
        payload: KnowledgeSearchRequest,
    ) -> KnowledgeSearchResponse:
        retrieval_query = KnowledgeRetrievalQuery(
            country=payload.country,
            visa_type=payload.visa_type,
            language=payload.language,
            authority_levels=payload.authority_levels,
            source_types=payload.source_types,
            query_text=payload.query,
            limit=min(max(payload.limit * 5, payload.limit), self._candidate_limit),
        )

        candidates = await self._knowledge_base_service.retrieve_candidate_chunks(
            session,
            retrieval_query,
            candidate_limit=retrieval_query.limit,
        )

        ranked_results = [
            self._score_candidate(chunk, payload.query)
            for chunk in candidates
        ]
        ranked_results = [item for item in ranked_results if item is not None]
        ranked_results.sort(
            key=lambda item: (
                item.score,
                item.lexical_score,
                item.freshness_score,
                item.authority_score,
            ),
            reverse=True,
        )

        results = [
            KnowledgeSearchResult(
                chunk=item.chunk,
                source=item.chunk.source,
                score=item.score,
                lexical_score=item.lexical_score,
                vector_score=item.vector_score,
                hybrid_score=item.hybrid_score,
                freshness_score=item.freshness_score,
                authority_score=item.authority_score,
                matched_terms=item.matched_terms,
                match_reason=item.match_reason,
            )
            for item in ranked_results[: payload.limit]
        ]

        return KnowledgeSearchResponse(
            backend=self.backend_name,
            total_results=len(results),
            results=results,
        )

    def _score_candidate(
        self,
        chunk: KnowledgeChunk,
        query: str,
    ) -> RetrievalScoredChunk | None:
        source = chunk.source
        query_terms = _tokenize(query)
        if not query_terms:
            return None

        chunk_terms = _tokenize(chunk.chunk_text)
        source_terms = _tokenize(
            " ".join(
                part
                for part in [
                    source.source_name,
                    source.country or "",
                    source.visa_type or "",
                ]
                if part
            )
        )

        chunk_matches = [term for term in query_terms if term in chunk_terms]
        source_matches = [term for term in query_terms if term in source_terms]
        matched_terms = sorted(set(chunk_matches + source_matches))

        if not matched_terms:
            return None

        chunk_match_ratio = len(chunk_matches) / len(query_terms)
        source_match_ratio = len(source_matches) / len(query_terms)
        exact_phrase_bonus = 0.2 if query.strip().lower() in chunk.chunk_text.lower() else 0.0
        lexical_score = round(
            min(1.0, (chunk_match_ratio * 0.75) + (source_match_ratio * 0.25) + exact_phrase_bonus),
            4,
        )
        freshness_score = _freshness_score(
            verified_at=source.verified_at,
            published_at=source.published_at,
        )
        authority_score = _authority_score(source.authority_level)
        score = round(
            (lexical_score * 0.7) + (freshness_score * 0.2) + (authority_score * 0.1),
            4,
        )

        return RetrievalScoredChunk(
            chunk=chunk,
            score=score,
            lexical_score=lexical_score,
            vector_score=0.0,
            hybrid_score=score,
            freshness_score=freshness_score,
            authority_score=authority_score,
            matched_terms=matched_terms,
            match_reason=_build_match_reason(
                matched_terms=matched_terms,
                source_name=source.source_name,
                authority_level=source.authority_level,
            ),
        )


class HybridKnowledgeRetriever:
    backend_name = "hybrid"

    def __init__(
        self,
        *,
        knowledge_base_service: KnowledgeBaseService,
        embedding_provider: KnowledgeEmbeddingProvider,
        lexical_candidate_limit: int,
        vector_candidate_limit: int,
        rrf_k: int,
        lexical_weight: float,
        vector_weight: float,
        freshness_weight: float,
        authority_weight: float,
    ) -> None:
        self._knowledge_base_service = knowledge_base_service
        self._embedding_provider = embedding_provider
        self._lexical_candidate_limit = max(lexical_candidate_limit, 10)
        self._vector_candidate_limit = max(vector_candidate_limit, 10)
        self._rrf_k = max(rrf_k, 1)
        self._lexical_weight = lexical_weight
        self._vector_weight = vector_weight
        self._freshness_weight = freshness_weight
        self._authority_weight = authority_weight

    async def search(
        self,
        *,
        session: AsyncSession,
        payload: KnowledgeSearchRequest,
    ) -> KnowledgeSearchResponse:
        retrieval_query = KnowledgeRetrievalQuery(
            country=payload.country,
            visa_type=payload.visa_type,
            language=payload.language,
            authority_levels=payload.authority_levels,
            source_types=payload.source_types,
            query_text=payload.query,
            limit=min(max(payload.limit * 5, payload.limit), self._lexical_candidate_limit),
        )

        lexical_candidates = await self._knowledge_base_service.retrieve_candidate_chunks(
            session,
            retrieval_query,
            candidate_limit=retrieval_query.limit,
        )
        lexical_ranked = [
            self._score_lexical_candidate(chunk, payload.query)
            for chunk in lexical_candidates
        ]
        lexical_ranked = [item for item in lexical_ranked if item is not None]

        vector_ranked: list[tuple[KnowledgeChunk, float]] = []
        try:
            query_embedding = await self._embedding_provider.embed_text(payload.query)
            vector_ranked = await self._knowledge_base_service.retrieve_vector_candidate_chunks(
                session,
                retrieval_query,
                query_embedding=query_embedding.values,
                candidate_limit=min(max(payload.limit * 4, payload.limit), self._vector_candidate_limit),
            )
        except Exception:
            vector_ranked = []

        fused = self._fuse_rankings(
            lexical_ranked=lexical_ranked,
            vector_ranked=vector_ranked,
        )
        fused.sort(
            key=lambda item: (
                item.hybrid_score,
                item.score,
                item.vector_score,
                item.lexical_score,
            ),
            reverse=True,
        )

        results = [
            KnowledgeSearchResult(
                chunk=item.chunk,
                source=item.chunk.source,
                score=item.score,
                lexical_score=item.lexical_score,
                vector_score=item.vector_score,
                hybrid_score=item.hybrid_score,
                freshness_score=item.freshness_score,
                authority_score=item.authority_score,
                matched_terms=item.matched_terms,
                match_reason=item.match_reason,
            )
            for item in fused[: payload.limit]
        ]

        return KnowledgeSearchResponse(
            backend=self.backend_name,
            total_results=len(results),
            results=results,
        )

    def _score_lexical_candidate(
        self,
        chunk: KnowledgeChunk,
        query: str,
    ) -> RetrievalScoredChunk | None:
        return LexicalKnowledgeRetriever(
            knowledge_base_service=self._knowledge_base_service,
            candidate_limit=self._lexical_candidate_limit,
        )._score_candidate(chunk, query)  # noqa: SLF001

    def _fuse_rankings(
        self,
        *,
        lexical_ranked: list[RetrievalScoredChunk],
        vector_ranked: list[tuple[KnowledgeChunk, float]],
    ) -> list[RetrievalScoredChunk]:
        lexical_by_id = {item.chunk.id: item for item in lexical_ranked}
        lexical_rank_map = {
            item.chunk.id: index + 1
            for index, item in enumerate(
                sorted(lexical_ranked, key=lambda candidate: candidate.lexical_score, reverse=True)
            )
        }
        vector_rank_map = {
            chunk.id: index + 1
            for index, (chunk, _) in enumerate(vector_ranked)
        }
        vector_score_map = {chunk.id: score for chunk, score in vector_ranked}

        fused_results: list[RetrievalScoredChunk] = []
        all_chunk_ids = set(lexical_by_id.keys()) | set(vector_rank_map.keys())

        for chunk_id in all_chunk_ids:
            lexical_item = lexical_by_id.get(chunk_id)
            if lexical_item is not None:
                chunk = lexical_item.chunk
                lexical_score = lexical_item.lexical_score
                freshness_score = lexical_item.freshness_score
                authority_score = lexical_item.authority_score
                matched_terms = lexical_item.matched_terms
                match_reason = lexical_item.match_reason
            else:
                chunk = next(chunk for chunk, _ in vector_ranked if chunk.id == chunk_id)
                source = chunk.source
                lexical_score = 0.0
                freshness_score = _freshness_score(
                    verified_at=source.verified_at,
                    published_at=source.published_at,
                )
                authority_score = _authority_score(source.authority_level)
                matched_terms = []
                match_reason = (
                    f"Vector similarity match from {source.source_name} with "
                    f"{source.authority_level.value} authority weighting."
                )

            vector_score = vector_score_map.get(chunk_id, 0.0)
            lexical_rrf = 1.0 / (self._rrf_k + lexical_rank_map[chunk_id]) if chunk_id in lexical_rank_map else 0.0
            vector_rrf = 1.0 / (self._rrf_k + vector_rank_map[chunk_id]) if chunk_id in vector_rank_map else 0.0
            hybrid_score = round(
                lexical_score * self._lexical_weight
                + vector_score * self._vector_weight
                + freshness_score * self._freshness_weight
                + authority_score * self._authority_weight
                + lexical_rrf
                + vector_rrf,
                4,
            )
            final_score = round(
                max(lexical_score, vector_score, hybrid_score)
                + freshness_score * 0.2
                + authority_score * 0.1,
                4,
            )
            fused_results.append(
                RetrievalScoredChunk(
                    chunk=chunk,
                    score=final_score,
                    lexical_score=lexical_score,
                    vector_score=vector_score,
                    hybrid_score=hybrid_score,
                    freshness_score=freshness_score,
                    authority_score=authority_score,
                    matched_terms=matched_terms,
                    match_reason=match_reason,
                )
            )

        return fused_results


class KnowledgeRetrievalService:
    """Public retrieval abstraction ready for future pgvector-backed search."""

    def __init__(
        self,
        *,
        default_backend: str,
        retrievers: dict[str, KnowledgeRetriever],
    ) -> None:
        self._default_backend = default_backend
        self._retrievers = retrievers

    async def search(
        self,
        *,
        session: AsyncSession,
        payload: KnowledgeSearchRequest,
    ) -> KnowledgeSearchResponse:
        requested_backend = payload.retrieval_mode
        backend = self._default_backend if requested_backend == "auto" else requested_backend
        retriever = self._retrievers.get(backend) or self._retrievers[self._default_backend]
        return await retriever.search(session=session, payload=payload)


def build_knowledge_retrieval_service(
    settings: Settings,
    *,
    knowledge_base_service: KnowledgeBaseService,
) -> KnowledgeRetrievalService:
    backend = settings.knowledge_retrieval_backend.strip().lower()
    embedding_provider = build_knowledge_embedding_provider(settings)
    retrievers: dict[str, KnowledgeRetriever] = {
        "lexical": LexicalKnowledgeRetriever(
            knowledge_base_service=knowledge_base_service,
            candidate_limit=settings.knowledge_search_candidate_limit,
        )
    }

    if backend == "lexical":
        return KnowledgeRetrievalService(
            default_backend="lexical",
            retrievers=retrievers,
        )
    if backend in {"hybrid", "auto"}:
        if embedding_provider.provider_name != "disabled":
            retrievers["hybrid"] = HybridKnowledgeRetriever(
                knowledge_base_service=knowledge_base_service,
                embedding_provider=embedding_provider,
                lexical_candidate_limit=settings.knowledge_search_candidate_limit,
                vector_candidate_limit=settings.knowledge_vector_candidate_limit,
                rrf_k=settings.knowledge_hybrid_rrf_k,
                lexical_weight=settings.knowledge_hybrid_lexical_weight,
                vector_weight=settings.knowledge_hybrid_vector_weight,
                freshness_weight=settings.knowledge_hybrid_freshness_weight,
                authority_weight=settings.knowledge_hybrid_authority_weight,
            )

        return KnowledgeRetrievalService(
            default_backend="hybrid" if "hybrid" in retrievers else "lexical",
            retrievers=retrievers,
        )

    raise ValueError(
        f"Unsupported knowledge retrieval backend: {settings.knowledge_retrieval_backend}"
    )


def _tokenize(value: str) -> set[str]:
    normalized = value.lower()
    tokens = {
        token
        for token in TOKEN_PATTERN.findall(normalized)
        if len(token) > 1 and token not in STOP_WORDS
    }

    for segment in re.split(r"\s+", normalized):
        collapsed = re.sub(r"[^a-z0-9]+", "", segment)
        if len(collapsed) > 1 and collapsed not in STOP_WORDS:
            tokens.add(collapsed)

    return tokens


def _freshness_score(
    *,
    verified_at: datetime | None,
    published_at: datetime | None,
) -> float:
    reference = verified_at or published_at
    if reference is None:
        return 0.2

    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)

    days_old = max((datetime.now(timezone.utc) - reference).days, 0)
    freshness = math.exp(-days_old / 365)
    return round(max(0.1, min(1.0, freshness)), 4)


def _authority_score(level: KnowledgeAuthorityLevel) -> float:
    if level == KnowledgeAuthorityLevel.PRIMARY:
        return 1.0
    if level == KnowledgeAuthorityLevel.SECONDARY:
        return 0.7
    return 0.4


def _build_match_reason(
    *,
    matched_terms: list[str],
    source_name: str,
    authority_level: KnowledgeAuthorityLevel,
) -> str:
    matched_preview = ", ".join(matched_terms[:4])
    return (
        f"Matched terms ({matched_preview}) in {source_name} with "
        f"{authority_level.value} authority weighting."
    )
