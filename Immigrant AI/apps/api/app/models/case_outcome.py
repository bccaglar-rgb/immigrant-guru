from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import CaseOutcomeStatus
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.immigration_case import ImmigrationCase
    from app.models.user import User


class CaseOutcome(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "case_outcomes"
    __table_args__ = (
        CheckConstraint(
            "duration_months IS NULL OR duration_months >= 0",
            name="duration_months_non_negative",
        ),
        CheckConstraint(
            "final_pathway IS NULL OR length(trim(final_pathway)) > 0",
            name="final_pathway_not_blank",
        ),
        UniqueConstraint("case_id", name="uq_case_outcomes_case_id"),
    )

    case_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("immigration_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    outcome: Mapped[CaseOutcomeStatus] = mapped_column(
        Enum(CaseOutcomeStatus, name="case_outcome_status"),
        nullable=False,
    )
    duration_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    final_pathway: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    decision_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recorded_by_user_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    immigration_case: Mapped[ImmigrationCase] = relationship(back_populates="outcome")
    recorded_by_user: Mapped[Optional[User]] = relationship(
        back_populates="recorded_case_outcomes"
    )
