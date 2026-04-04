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
from app.services.knowledge_base_service import KnowledgeBaseService

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
            freshness_score=freshness_score,
            authority_score=authority_score,
            matched_terms=matched_terms,
            match_reason=_build_match_reason(
                matched_terms=matched_terms,
                source_name=source.source_name,
                authority_level=source.authority_level,
            ),
        )


class KnowledgeRetrievalService:
    """Public retrieval abstraction ready for future pgvector-backed search."""

    def __init__(
        self,
        *,
        retriever: KnowledgeRetriever,
    ) -> None:
        self._retriever = retriever

    async def search(
        self,
        *,
        session: AsyncSession,
        payload: KnowledgeSearchRequest,
    ) -> KnowledgeSearchResponse:
        return await self._retriever.search(session=session, payload=payload)


def build_knowledge_retrieval_service(
    settings: Settings,
    *,
    knowledge_base_service: KnowledgeBaseService,
) -> KnowledgeRetrievalService:
    backend = settings.knowledge_retrieval_backend.strip().lower()

    if backend == "lexical":
        retriever: KnowledgeRetriever = LexicalKnowledgeRetriever(
            knowledge_base_service=knowledge_base_service,
            candidate_limit=settings.knowledge_search_candidate_limit,
        )
        return KnowledgeRetrievalService(retriever=retriever)

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
