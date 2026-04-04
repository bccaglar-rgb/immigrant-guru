from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ImmigrationCaseStatus
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.user import User


class ImmigrationCase(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "immigration_cases"
    __table_args__ = (
        CheckConstraint("length(trim(title)) > 0", name="title_not_blank"),
        CheckConstraint(
            "latest_score IS NULL OR (latest_score >= 0 AND latest_score <= 100)",
            name="latest_score_range",
        ),
        CheckConstraint(
            "risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)",
            name="risk_score_range",
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    target_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    target_program: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    current_stage: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    status: Mapped[ImmigrationCaseStatus] = mapped_column(
        Enum(ImmigrationCaseStatus, name="immigration_case_status"),
        default=ImmigrationCaseStatus.DRAFT,
        nullable=False,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latest_score: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )
    risk_score: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )

    user: Mapped[User] = relationship(back_populates="immigration_cases")
    documents: Mapped[list[Document]] = relationship(
        back_populates="immigration_case",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
