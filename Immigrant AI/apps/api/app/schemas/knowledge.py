from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import KnowledgeAuthorityLevel, KnowledgeSourceType

KNOWLEDGE_SOURCE_EXAMPLE = {
    "source_name": "USCIS H-1B Specialty Occupations",
    "source_type": "government_website",
    "country": "United States",
    "visa_type": "H-1B",
    "language": "en",
    "authority_level": "primary",
    "published_at": "2026-03-15T00:00:00Z",
    "verified_at": "2026-04-02T09:30:00Z",
    "metadata": {
        "source_url": "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations"
    },
}

KNOWLEDGE_CHUNK_EXAMPLE = {
    "chunk_index": 0,
    "chunk_text": "H-1B classification applies to specialty occupations requiring specialized knowledge.",
    "language": "en",
    "metadata": {"section_heading": "Overview"},
}


class KnowledgeSourceBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_name: str = Field(min_length=1, max_length=255)
    source_type: KnowledgeSourceType
    country: str | None = Field(default=None, max_length=100)
    visa_type: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, max_length=32)
    authority_level: KnowledgeAuthorityLevel
    published_at: datetime | None = None
    verified_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class KnowledgeChunkBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chunk_index: int = Field(ge=0)
    chunk_text: str = Field(min_length=1)
    language: str | None = Field(default=None, max_length=32)
    metadata: dict[str, Any] = Field(default_factory=dict)


class KnowledgeChunkCreate(KnowledgeChunkBase):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": KNOWLEDGE_CHUNK_EXAMPLE},
    )


class KnowledgeChunkIngestionCreate(KnowledgeChunkCreate):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "source_id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
                **KNOWLEDGE_CHUNK_EXAMPLE,
            }
        },
    )

    source_id: UUID


class KnowledgeChunkRead(KnowledgeChunkBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    source_id: UUID
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="metadata_json",
        serialization_alias="metadata",
    )
    created_at: datetime
    updated_at: datetime


class KnowledgeSourceCreate(KnowledgeSourceBase):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": KNOWLEDGE_SOURCE_EXAMPLE},
    )

    chunks: list[KnowledgeChunkCreate] = Field(default_factory=list)


class KnowledgeSourceRead(KnowledgeSourceBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="metadata_json",
        serialization_alias="metadata",
    )
    created_at: datetime
    updated_at: datetime
    chunks: list[KnowledgeChunkRead] = Field(default_factory=list)


class KnowledgeSourceSummaryRead(KnowledgeSourceBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="metadata_json",
        serialization_alias="metadata",
    )
    created_at: datetime
    updated_at: datetime


class KnowledgeChunkMatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chunk: KnowledgeChunkRead
    source: KnowledgeSourceRead
    score: float | None = None
    match_reason: str | None = None


class KnowledgeRetrievalQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country: str | None = Field(default=None, max_length=100)
    visa_type: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, max_length=32)
    authority_levels: list[KnowledgeAuthorityLevel] = Field(default_factory=list)
    source_types: list[KnowledgeSourceType] = Field(default_factory=list)
    query_text: str | None = None
    limit: int = Field(default=10, ge=1, le=50)


class KnowledgeSearchRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "query": "specialty occupation degree requirement",
                "country": "United States",
                "visa_type": "H-1B",
                "source_types": ["government_website", "policy_manual"],
                "authority_levels": ["primary"],
                "limit": 5,
            }
        },
    )

    query: str = Field(min_length=2, max_length=1000)
    country: str | None = Field(default=None, max_length=100)
    visa_type: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, max_length=32)
    source_types: list[KnowledgeSourceType] = Field(default_factory=list)
    authority_levels: list[KnowledgeAuthorityLevel] = Field(default_factory=list)
    retrieval_mode: Literal["auto", "lexical", "hybrid"] = "auto"
    limit: int = Field(default=10, ge=1, le=25)


class KnowledgeSearchResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chunk: KnowledgeChunkRead
    source: KnowledgeSourceSummaryRead
    score: float = Field(ge=0)
    lexical_score: float = Field(ge=0)
    vector_score: float = Field(default=0, ge=0)
    hybrid_score: float = Field(default=0, ge=0)
    freshness_score: float = Field(ge=0)
    authority_score: float = Field(ge=0)
    matched_terms: list[str] = Field(default_factory=list)
    match_reason: str


class KnowledgeSearchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    backend: str
    total_results: int = Field(ge=0)
    results: list[KnowledgeSearchResult]
