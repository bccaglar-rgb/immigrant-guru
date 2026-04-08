from __future__ import annotations

import hashlib
import hmac
import json
import time
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes import billing


class DummySession:
    def __init__(self) -> None:
        self.committed = False
        self.refreshed = False

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, _value: object) -> None:
        self.refreshed = True


@pytest.mark.asyncio
async def test_checkout_rejects_demo_upgrade_without_stripe_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = SimpleNamespace(
        app_env="production",
        stripe_secret_key="",
        stripe_starter_price_id="",
        stripe_plus_price_id="",
        stripe_premium_price_id="",
        frontend_app_url="https://immigrant.guru",
    )
    monkeypatch.setattr(billing, "get_settings", lambda: settings)

    user = SimpleNamespace(
        id=uuid4(),
        email="billing@example.com",
        plan="free",
        profile=None,
    )
    session = DummySession()

    with pytest.raises(HTTPException) as exc_info:
        await billing.create_checkout(
            billing.CheckoutRequest(plan="starter"),
            session=session,
            current_user=user,
        )

    assert exc_info.value.status_code == 503
    assert user.plan == "free"
    assert session.committed is False


@pytest.mark.asyncio
async def test_stripe_webhook_ignores_duplicate_event(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = SimpleNamespace(
        app_env="development",
        stripe_webhook_secret="",
        stripe_webhook_tolerance_seconds=300,
        stripe_webhook_event_ttl_seconds=604800,
        redis_url="redis://localhost:6379/0",
    )
    monkeypatch.setattr(billing, "get_settings", lambda: settings)
    async def fake_claim(*args, **kwargs) -> bool:
        return False

    monkeypatch.setattr(billing, "_claim_stripe_event", fake_claim)

    payload = json.dumps(
        {"id": "evt_duplicate", "type": "checkout.session.completed", "data": {"object": {}}}
    ).encode("utf-8")

    async def read_body() -> bytes:
        return payload

    request = SimpleNamespace(headers={}, body=read_body)

    response = await billing.stripe_webhook(request=request, session=DummySession())
    assert response == {"status": "duplicate_ignored"}


def test_verify_stripe_signature_accepts_valid_signature() -> None:
    secret = "whsec_test_secret"
    payload = json.dumps({"type": "checkout.session.completed"}).encode("utf-8")
    timestamp = int(time.time())
    signed_payload = f"{timestamp}.".encode("utf-8") + payload
    digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    header = f"t={timestamp},v1={digest}"

    assert billing._verify_stripe_signature(payload, header, secret, 300) is True


def test_verify_stripe_signature_rejects_invalid_signature() -> None:
    payload = b'{"type":"checkout.session.completed"}'
    timestamp = int(time.time())
    header = f"t={timestamp},v1=invalid"

    assert billing._verify_stripe_signature(payload, header, "whsec_test_secret", 300) is False
