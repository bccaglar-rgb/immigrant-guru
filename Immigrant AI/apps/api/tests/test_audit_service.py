from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest

from app.models.enums import (
    AuditEventType,
    AuditTargetEntityType,
    ImmigrationCaseStatus,
)
from app.services.shared.audit_service import AuditService


class FakeSession:
    def __init__(self, *, fail_commit: bool = False) -> None:
        self.added = []
        self.fail_commit = fail_commit
        self.commit_count = 0
        self.refresh_count = 0
        self.rollback_count = 0

    def add(self, value) -> None:
        self.added.append(value)

    async def commit(self) -> None:
        self.commit_count += 1
        if self.fail_commit:
            raise RuntimeError("commit failed")

    async def refresh(self, value) -> None:
        self.refresh_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


@pytest.mark.asyncio
async def test_record_event_normalizes_metadata_values() -> None:
    service = AuditService()
    session = FakeSession()
    actor_user_id = uuid4()
    target_id = uuid4()
    now = datetime(2026, 4, 3, tzinfo=timezone.utc)

    audit_log = await service.record_event(
        session,
        actor_user_id=actor_user_id,
        event_type=AuditEventType.CASE_UPDATED,
        target_entity_type=AuditTargetEntityType.IMMIGRATION_CASE,
        target_entity_id=target_id,
        metadata={
            "user_id": actor_user_id,
            "target_id": target_id,
            "timestamp": now,
            "amount": Decimal("12.50"),
            "status": ImmigrationCaseStatus.DRAFT,
            "nested": {"items": [target_id, now]},
        },
    )

    assert audit_log is not None
    assert session.commit_count == 1
    assert session.refresh_count == 1
    assert audit_log.metadata_json["user_id"] == str(actor_user_id)
    assert audit_log.metadata_json["target_id"] == str(target_id)
    assert audit_log.metadata_json["timestamp"] == now.isoformat()
    assert audit_log.metadata_json["amount"] == "12.50"
    assert audit_log.metadata_json["status"] == ImmigrationCaseStatus.DRAFT.value
    assert audit_log.metadata_json["nested"]["items"] == [
        str(target_id),
        now.isoformat(),
    ]


@pytest.mark.asyncio
async def test_record_event_rolls_back_and_returns_none_when_commit_fails() -> None:
    service = AuditService()
    session = FakeSession(fail_commit=True)

    audit_log = await service.record_event(
        session,
        actor_user_id=None,
        event_type=AuditEventType.USER_LOGGED_IN,
        target_entity_type=AuditTargetEntityType.USER,
        metadata={"email": "user@example.com"},
    )

    assert audit_log is None
    assert session.commit_count == 1
    assert session.rollback_count == 1
