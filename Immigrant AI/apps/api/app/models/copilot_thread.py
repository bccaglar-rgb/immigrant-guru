from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.copilot_message import CopilotMessage
    from app.models.immigration_case import ImmigrationCase
    from app.models.user import User


class CopilotThread(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "copilot_threads"
    __table_args__ = (
        UniqueConstraint("case_id", "user_id", name="uq_copilot_threads_case_user"),
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

    immigration_case: Mapped[ImmigrationCase] = relationship(
        back_populates="copilot_threads"
    )
    user: Mapped[User] = relationship(back_populates="copilot_threads")
    messages: Mapped[list[CopilotMessage]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
        order_by="CopilotMessage.created_at",
    )
