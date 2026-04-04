from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy import Enum, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ImmigrationCaseStatus


class ImmigrationCase(Base):
    __tablename__ = "immigration_cases"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    target_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    target_program: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    current_stage: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    status: Mapped[ImmigrationCaseStatus] = mapped_column(
        Enum(ImmigrationCaseStatus, name="immigration_case_status"),
        nullable=False,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
