from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.enums import AuditEventType, AuditTargetEntityType

logger = logging.getLogger("immigrant-ai-api.audit")


class AuditService:
    """Write lightweight immutable audit records without cluttering route logic."""

    async def record_event(
        self,
        session: AsyncSession,
        *,
        actor_user_id: UUID | None,
        event_type: AuditEventType,
        target_entity_type: AuditTargetEntityType,
        target_entity_id: UUID | None = None,
        metadata: Mapping[str, Any] | None = None,
        commit: bool = True,
    ) -> AuditLog | None:
        audit_log = AuditLog(
            actor_user_id=actor_user_id,
            event_type=event_type,
            target_entity_type=target_entity_type,
            target_entity_id=target_entity_id,
            metadata_json=self._normalize_mapping(metadata or {}),
        )
        session.add(audit_log)

        if not commit:
            return audit_log

        try:
            await session.commit()
            await session.refresh(audit_log)
        except Exception:
            await session.rollback()
            logger.exception(
                "audit.record_failed",
                extra={
                    "event_type": event_type.value,
                    "target_entity_type": target_entity_type.value,
                    "target_entity_id": str(target_entity_id) if target_entity_id else None,
                },
            )
            return None

        return audit_log

    def _normalize_mapping(self, metadata: Mapping[str, Any]) -> dict[str, Any]:
        normalized: dict[str, Any] = {}
        for key, value in metadata.items():
            normalized[str(key)] = self._normalize_value(value)
        return normalized

    def _normalize_value(self, value: Any) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, Enum):
            enum_value = getattr(value, "value", None)
            return (
                enum_value
                if isinstance(enum_value, (str, int, float, bool))
                else str(value)
            )
        if isinstance(value, Mapping):
            return self._normalize_mapping(value)
        if isinstance(value, Sequence) and not isinstance(
            value, (str, bytes, bytearray)
        ):
            return [self._normalize_value(item) for item in value]
        return str(value)
