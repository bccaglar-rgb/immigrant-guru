from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.immigration_case import ImmigrationCase


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CaseTimelineSnapshot(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "case_timeline_snapshots"
    __table_args__ = (
        Index("ix_case_timeline_snapshots_case_id_generated_at", "case_id", "generated_at"),
    )

    case_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("immigration_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    simulation_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
    )

    immigration_case: Mapped[ImmigrationCase] = relationship(
        back_populates="timeline_snapshots"
    )
