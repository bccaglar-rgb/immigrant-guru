from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import AuditEventType, AuditTargetEntityType
from app.models.mixins import UUIDPrimaryKeyMixin


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AuditLog(UUIDPrimaryKeyMixin, Base):
    """Lightweight immutable audit record for critical product actions."""

    __tablename__ = "audit_logs"

    actor_user_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[AuditEventType] = mapped_column(
        Enum(AuditEventType, name="audit_event_type"),
        nullable=False,
        index=True,
    )
    target_entity_type: Mapped[AuditTargetEntityType] = mapped_column(
        Enum(AuditTargetEntityType, name="audit_target_entity_type"),
        nullable=False,
        index=True,
    )
    target_entity_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
    )
