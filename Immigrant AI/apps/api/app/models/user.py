from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import UserStatus
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.ai_feedback import AIFeedback
    from app.models.case_outcome import CaseOutcome
    from app.models.copilot_message import CopilotMessage
    from app.models.copilot_thread import CopilotThread
    from app.models.immigration_case import ImmigrationCase
    from app.models.user_profile import UserProfile


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("length(trim(email)) > 0", name="email_not_blank"),
        CheckConstraint("length(trim(password_hash)) > 0", name="password_hash_not_blank"),
    )

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="user_status"),
        default=UserStatus.ACTIVE,
        nullable=False,
    )

    profile: Mapped[Optional[UserProfile]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
        uselist=False,
    )
    immigration_cases: Mapped[list[ImmigrationCase]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
    copilot_threads: Mapped[list[CopilotThread]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
    copilot_messages: Mapped[list[CopilotMessage]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
    recorded_case_outcomes: Mapped[list[CaseOutcome]] = relationship(
        back_populates="recorded_by_user",
        passive_deletes=True,
    )
    ai_feedback_entries: Mapped[list[AIFeedback]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
