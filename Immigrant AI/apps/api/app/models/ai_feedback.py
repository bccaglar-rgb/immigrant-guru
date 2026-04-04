from __future__ import annotations

from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import CheckConstraint, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AIFeedbackRating, AIFeature
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.immigration_case import ImmigrationCase
    from app.models.user import User


class AIFeedback(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ai_feedback"
    __table_args__ = (
        CheckConstraint(
            "comment IS NULL OR length(trim(comment)) > 0",
            name="comment_not_blank",
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    case_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("immigration_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feature: Mapped[AIFeature] = mapped_column(
        Enum(AIFeature, name="ai_feature"),
        nullable=False,
    )
    rating: Mapped[AIFeedbackRating] = mapped_column(
        Enum(AIFeedbackRating, name="ai_feedback_rating"),
        nullable=False,
    )
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    user: Mapped[User] = relationship(back_populates="ai_feedback_entries")
    immigration_case: Mapped[ImmigrationCase] = relationship(
        back_populates="ai_feedback_entries"
    )
