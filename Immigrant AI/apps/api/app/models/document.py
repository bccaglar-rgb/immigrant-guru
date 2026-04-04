from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import DocumentUploadStatus
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.immigration_case import ImmigrationCase


class Document(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint("length(trim(filename)) > 0", name="filename_not_blank"),
        CheckConstraint(
            "length(trim(original_filename)) > 0",
            name="original_filename_not_blank",
        ),
        CheckConstraint("length(trim(storage_path)) > 0", name="storage_path_not_blank"),
        CheckConstraint("size >= 0", name="size_non_negative"),
        CheckConstraint(
            "processing_attempts >= 0",
            name="processing_attempts_non_negative",
        ),
    )

    case_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("immigration_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    upload_status: Mapped[DocumentUploadStatus] = mapped_column(
        Enum(DocumentUploadStatus, name="document_upload_status"),
        default=DocumentUploadStatus.PENDING,
        nullable=False,
    )
    document_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    processing_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    processing_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    analysis_metadata: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )

    immigration_case: Mapped[ImmigrationCase] = relationship(back_populates="documents")
