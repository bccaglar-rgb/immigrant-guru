from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional
from uuid import UUID

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ImmigrationCaseStatus, PathwayProbabilityConfidenceLevel
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.ai_feedback import AIFeedback
    from app.models.case_outcome import CaseOutcome
    from app.models.case_timeline_snapshot import CaseTimelineSnapshot
    from app.models.copilot_message import CopilotMessage
    from app.models.copilot_thread import CopilotThread
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
        CheckConstraint(
            "probability_score IS NULL OR (probability_score >= 0 AND probability_score <= 100)",
            name="probability_score_range",
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
    probability_score: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )
    probability_confidence: Mapped[Optional[PathwayProbabilityConfidenceLevel]] = mapped_column(
        Enum(
            PathwayProbabilityConfidenceLevel,
            name="pathway_probability_confidence_level",
        ),
        nullable=True,
    )
    probability_explanation_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )

    user: Mapped[User] = relationship(back_populates="immigration_cases")
    documents: Mapped[list[Document]] = relationship(
        back_populates="immigration_case",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
    timeline_snapshots: Mapped[list[CaseTimelineSnapshot]] = relationship(
        back_populates="immigration_case",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
    copilot_threads: Mapped[list[CopilotThread]] = relationship(
        back_populates="immigration_case",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
    copilot_messages: Mapped[list[CopilotMessage]] = relationship(
        back_populates="immigration_case",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
    outcome: Mapped[Optional[CaseOutcome]] = relationship(
        back_populates="immigration_case",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
        uselist=False,
    )
    ai_feedback_entries: Mapped[list[AIFeedback]] = relationship(
        back_populates="immigration_case",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
