from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DocumentUploadStatus

DOCUMENT_EXAMPLE = {
    "id": "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
    "case_id": "c43fdff6-311a-4204-92ad-8c4729ce3fe0",
    "filename": "1d0c3533f6bc4afcb6ad18a49e9f8772_passport.pdf",
    "original_filename": "passport.pdf",
    "mime_type": "application/pdf",
    "size": 248921,
    "storage_path": "documents/c43fdff6-311a-4204-92ad-8c4729ce3fe0/1d0c3533f6bc4afcb6ad18a49e9f8772_passport.pdf",
    "upload_status": "pending",
    "document_type": None,
    "processing_attempts": 0,
    "processed_at": None,
    "processing_error": None,
    "created_at": "2026-04-02T12:00:00Z",
    "updated_at": "2026-04-02T12:00:00Z",
}


class DocumentRead(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={"example": DOCUMENT_EXAMPLE},
    )

    id: UUID
    case_id: UUID
    filename: str = Field(min_length=1, max_length=255)
    original_filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=0)
    storage_path: str = Field(min_length=1, max_length=1024)
    upload_status: DocumentUploadStatus
    document_type: str | None = Field(default=None, max_length=120)
    processing_attempts: int = Field(ge=0)
    processed_at: datetime | None = None
    processing_error: str | None = None
    analysis_metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class DocumentAuditRiskLevel(str):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class DocumentAuditResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detected_documents: list[str] = Field(default_factory=list, max_length=20)
    missing_documents: list[str] = Field(default_factory=list, max_length=20)
    issues_found: list[str] = Field(default_factory=list, max_length=20)
    risk_level: str = Field(pattern="^(low|medium|high)$")
    recommendations: list[str] = Field(default_factory=list, max_length=12)
