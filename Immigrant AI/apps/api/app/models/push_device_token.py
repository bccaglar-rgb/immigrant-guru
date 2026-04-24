from __future__ import annotations

from uuid import UUID

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PushPlatform(str):
    IOS = "ios"
    ANDROID = "android"
    WEB = "web"


class PushDeviceToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Registered push notification tokens per (user, device).

    One user may have multiple devices (phone + tablet).  Tokens are rotated
    by Apple/Google, so we upsert by token string rather than by device id.
    """

    __tablename__ = "push_device_tokens"
    __table_args__ = (
        UniqueConstraint("token", name="push_device_tokens_token_unique"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token: Mapped[str] = mapped_column(String(512), nullable=False)
    platform: Mapped[str] = mapped_column(
        Enum("ios", "android", "web", name="push_platform"),
        nullable=False,
    )
    locale: Mapped[str | None] = mapped_column(String(16), nullable=True)
    app_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
