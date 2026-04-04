from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import CheckConstraint, DateTime, Enum, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import KnowledgeAuthorityLevel, KnowledgeSourceType
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.knowledge_chunk import KnowledgeChunk


class KnowledgeSource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Canonical metadata record for a knowledge asset and its downstream chunks."""

    __tablename__ = "knowledge_sources"
    __table_args__ = (
        CheckConstraint("length(trim(source_name)) > 0", name="source_name_not_blank"),
    )

    source_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    source_type: Mapped[KnowledgeSourceType] = mapped_column(
        Enum(KnowledgeSourceType, name="knowledge_source_type"),
        nullable=False,
        index=True,
    )
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    visa_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    language: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    authority_level: Mapped[KnowledgeAuthorityLevel] = mapped_column(
        Enum(KnowledgeAuthorityLevel, name="knowledge_authority_level"),
        nullable=False,
        index=True,
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )

    chunks: Mapped[list[KnowledgeChunk]] = relationship(
        back_populates="source",
        cascade="all, delete-orphan",
        order_by="KnowledgeChunk.chunk_index",
        passive_deletes=True,
        single_parent=True,
    )
