from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    EducationLevel,
    EnglishLevel,
    MaritalStatus,
    RelocationTimeline,
)
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class UserProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_profiles"
    __table_args__ = (
        CheckConstraint(
            "children_count IS NULL OR children_count >= 0",
            name="children_count_non_negative",
        ),
        CheckConstraint(
            "years_of_experience IS NULL OR years_of_experience >= 0",
            name="years_of_experience_non_negative",
        ),
        CheckConstraint(
            "available_capital IS NULL OR available_capital >= 0",
            name="available_capital_non_negative",
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    nationality: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    current_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    target_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    marital_status: Mapped[Optional[MaritalStatus]] = mapped_column(
        Enum(MaritalStatus, name="marital_status"),
        nullable=True,
    )
    children_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    education_level: Mapped[Optional[EducationLevel]] = mapped_column(
        Enum(EducationLevel, name="education_level"),
        nullable=True,
    )
    english_level: Mapped[Optional[EnglishLevel]] = mapped_column(
        Enum(EnglishLevel, name="english_level"),
        nullable=True,
    )
    profession: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    years_of_experience: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    available_capital: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )
    criminal_record_flag: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    prior_visa_refusal_flag: Mapped[Optional[bool]] = mapped_column(
        Boolean,
        nullable=True,
    )
    relocation_timeline: Mapped[Optional[RelocationTimeline]] = mapped_column(
        Enum(RelocationTimeline, name="relocation_timeline"),
        nullable=True,
    )
    preferred_language: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    user: Mapped[User] = relationship(back_populates="profile")
