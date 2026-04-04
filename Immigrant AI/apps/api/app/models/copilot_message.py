from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import CopilotMessageRole
from app.models.mixins import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.copilot_thread import CopilotThread
    from app.models.immigration_case import ImmigrationCase
    from app.models.user import User


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CopilotMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "copilot_messages"
    __table_args__ = (
        CheckConstraint("length(trim(content)) > 0", name="content_not_blank"),
    )

    thread_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("copilot_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    case_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("immigration_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[CopilotMessageRole] = mapped_column(
        Enum(CopilotMessageRole, name="copilot_message_role"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
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

    thread: Mapped[CopilotThread] = relationship(back_populates="messages")
    immigration_case: Mapped[ImmigrationCase] = relationship(
        back_populates="copilot_messages"
    )
    user: Mapped[User] = relationship(back_populates="copilot_messages")
