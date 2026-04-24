from __future__ import annotations

"""Billing and plan management — real Stripe Checkout integration."""

import hashlib
import hmac
import json
import logging
import time
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from redis.asyncio import from_url as redis_from_url
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_current_user
from app.db.session import get_db_session
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

PLANS = {
    "free": {"name": "Free", "price": 0, "countries": 0, "features": ["Profile builder", "Short AI analysis", "Preview recommendations"]},
    "starter": {"name": "Starter", "price": 19, "countries": 1, "features": ["Full plan for 1 country", "Best visa recommendation", "Detailed eligibility breakdown", "Top path explanation", "Basic next steps"]},
    "plus": {"name": "Plus", "price": 29, "countries": 3, "popular": True, "features": ["Everything in Starter", "Step-by-step roadmap", "Cost estimate", "Timeline estimate", "Document checklist", "3 country comparisons"]},
    "premium": {"name": "Premium", "price": 49, "countries": 999, "features": ["Everything in Plus", "Full strategic recommendation", "Priority AI guidance", "Advanced action plan", "Full path comparison", "Stronger case support", "Premium dashboard"]},
}


class CheckoutRequest(BaseModel):
    plan: str


def _normalize_plan(plan: str) -> str:
    return plan.strip().lower()


def _build_checkout_redirect_url(base_url: str, *, upgraded: bool, plan: str = "") -> str:
    params: dict[str, str] = {"upgraded" if upgraded else "canceled": "true"}
    if not upgraded and plan:
        params["plan"] = plan
    return f"{base_url.rstrip('/')}/analysis?{urlencode(params)}"


def _parse_stripe_signature_header(value: str) -> tuple[int | None, list[str]]:
    timestamp: int | None = None
    signatures: list[str] = []

    for part in value.split(","):
        key, _, raw = part.strip().partition("=")
        if key == "t":
            try:
                timestamp = int(raw)
            except ValueError:
                return None, []
        elif key == "v1" and raw:
            signatures.append(raw)

    return timestamp, signatures


def _verify_stripe_signature(payload: bytes, signature_header: str, secret: str, tolerance_seconds: int) -> bool:
    timestamp, signatures = _parse_stripe_signature_header(signature_header)
    if timestamp is None or not signatures:
        return False

    if tolerance_seconds > 0 and abs(int(time.time()) - timestamp) > tolerance_seconds:
        return False

    signed_payload = f"{timestamp}.".encode("utf-8") + payload
    expected = hmac.new(
        secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    return any(hmac.compare_digest(expected, candidate) for candidate in signatures)


_PAID_PLANS = {"starter", "plus", "premium"}


async def _claim_stripe_event(event_id: str, redis_url: str, ttl_seconds: int) -> bool:
    """Claim a Stripe event ID in Redis to prevent duplicate processing.

    Returns True  → event is new, process it.
    Returns False → event already seen, skip it.
    On Redis failure: log and return True (fail-open: better to risk a duplicate
    than to silently drop a payment confirmation).
    """
    redis_client = None
    try:
        redis_client = redis_from_url(
            redis_url,
            decode_responses=True,
            health_check_interval=30,
        )
        result = await redis_client.set(
            f"stripe:webhook:event:{event_id}",
            "1",
            ex=max(ttl_seconds, 60),
            nx=True,
        )
        return bool(result)
    except Exception:
        logger.exception("stripe.webhook_replay_guard_failed event_id=%s — failing open", event_id)
        return True  # fail-open: process the event; webhook handler is idempotent
    finally:
        if redis_client is not None:
            await redis_client.aclose()


@router.get("/plans")
async def get_plans():
    """Return available pricing plans."""
    return {"plans": PLANS}


@router.get("/status")
async def get_billing_status(
    current_user: User = Depends(get_current_user),
):
    """Return current user's plan status."""
    plan_key = current_user.plan or "free"
    plan_info = PLANS.get(plan_key, PLANS["free"])
    return {
        "plan": plan_key,
        "plan_name": plan_info["name"],
        "price": plan_info["price"],
        "features": plan_info["features"],
        "is_premium": plan_key != "free",
    }


@router.post("/verify-upgrade")
async def verify_upgrade(
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """Verify a pending Stripe checkout session and upgrade plan if paid.

    Called after Stripe redirects to success_url (?upgraded=true).
    Falls back gracefully when Stripe is not configured.
    """
    settings = get_settings()

    if not settings.stripe_secret_key or not current_user.stripe_session_id:
        plan_key = current_user.plan or "free"
        return {"upgraded": False, "plan": plan_key}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.stripe.com/v1/checkout/sessions/{current_user.stripe_session_id}",
                auth=(settings.stripe_secret_key, ""),
            )
            checkout_session = resp.json()

        if resp.status_code != 200:
            logger.warning("billing.verify_upgrade_stripe_error session=%s", current_user.stripe_session_id)
            return {"upgraded": False, "plan": current_user.plan or "free"}

        payment_status = checkout_session.get("payment_status")
        metadata = checkout_session.get("metadata", {})
        plan = _normalize_plan(str(metadata.get("plan", "")))

        if payment_status == "paid" and plan in _PAID_PLANS and (current_user.plan or "free") == "free":
            current_user.plan = plan
            current_user.stripe_customer_id = checkout_session.get("customer") or current_user.stripe_customer_id
            await session.commit()
            await session.refresh(current_user)
            logger.info("billing.verify_upgrade_success user=%s plan=%s", current_user.id, plan)

            try:
                from app.services.shared.email_service import send_upgrade_email
                plan_name = str(PLANS.get(plan, {}).get("name", plan))
                first_name = current_user.profile.first_name if current_user.profile else None
                await send_upgrade_email(current_user.email, plan_name, first_name)
            except Exception:
                logger.exception("billing.verify_upgrade_email_error user=%s", current_user.id)

            return {"upgraded": True, "plan": plan}

        return {"upgraded": False, "plan": current_user.plan or "free"}

    except httpx.HTTPError as e:
        logger.error("billing.verify_upgrade_http_error error=%s", str(e))
        return {"upgraded": False, "plan": current_user.plan or "free"}


@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """Create a Stripe Checkout Session and return the URL."""
    normalized_plan = _normalize_plan(body.plan)

    if normalized_plan not in _PAID_PLANS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid plan: {body.plan!r}. Choose one of: {', '.join(sorted(_PAID_PLANS))}")

    settings = get_settings()
    plan_info = PLANS[normalized_plan]
    plan_name = str(plan_info["name"])

    # Map plan to Stripe price ID
    price_map = {
        "starter": settings.stripe_starter_price_id,
        "plus": settings.stripe_plus_price_id,
        "premium": settings.stripe_premium_price_id,
    }
    price_id = price_map.get(normalized_plan)

    if not price_id or not settings.stripe_secret_key:
        logger.error("billing.stripe_not_configured env=%s plan=%s", settings.app_env, normalized_plan)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is temporarily unavailable.",
        )

    # Real Stripe Checkout Session
    idempotency_key = f"checkout-{current_user.id}-{normalized_plan}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.stripe.com/v1/checkout/sessions",
                auth=(settings.stripe_secret_key, ""),
                headers={"Idempotency-Key": idempotency_key},
                data={
                    "mode": "payment",
                    "payment_method_types[]": "card",
                    "line_items[0][price]": price_id,
                    "line_items[0][quantity]": "1",
                    "customer_email": current_user.email,
                    "client_reference_id": str(current_user.id),
                    "metadata[plan]": normalized_plan,
                    "metadata[user_id]": str(current_user.id),
                    "success_url": _build_checkout_redirect_url(settings.frontend_app_url, upgraded=True),
                    "cancel_url": _build_checkout_redirect_url(settings.frontend_app_url, upgraded=False, plan=normalized_plan),
                },
            )
            checkout: dict[str, Any] = resp.json()

            if resp.status_code not in (200, 201):
                logger.error("stripe.checkout_failed error=%s", checkout)
                raise HTTPException(status_code=500, detail="Payment session could not be created.")

            # Save session ID on user
            current_user.stripe_session_id = checkout["id"]
            await session.commit()

            logger.info("stripe.checkout_created user=%s plan=%s session=%s", current_user.id, normalized_plan, checkout["id"])

            return {
                "success": True,
                "mode": "stripe",
                "checkout_url": checkout["url"],
                "session_id": checkout["id"],
                "plan": normalized_plan,
            }

    except httpx.HTTPError as e:
        logger.error("stripe.error error=%s", str(e))
        raise HTTPException(status_code=500, detail="Payment service unavailable.")


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
):
    """Handle Stripe webhook events."""
    settings = get_settings()
    body = await request.body()

    # Signature verification is mandatory in all environments.
    if not settings.stripe_webhook_secret:
        logger.error("stripe.webhook_secret_missing env=%s", settings.app_env)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe webhook is not configured.",
        )
    signature_header = request.headers.get("Stripe-Signature")
    if not signature_header or not _verify_stripe_signature(
        body,
        signature_header,
        settings.stripe_webhook_secret,
        settings.stripe_webhook_tolerance_seconds,
    ):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        event = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event.get("type", "")
    event_id = str(event.get("id", "")).strip()
    logger.info("stripe.webhook type=%s", event_type)

    if event_id:
        claimed = await _claim_stripe_event(
            event_id,
            settings.redis_url,
            settings.stripe_webhook_event_ttl_seconds,
        )
        if not claimed:
            logger.info("stripe.webhook_duplicate event_id=%s", event_id)
            return {"status": "duplicate_ignored"}

    if event_type == "checkout.session.completed":
        data = event.get("data", {}).get("object", {})
        payment_status = data.get("payment_status", "")
        user_id = data.get("metadata", {}).get("user_id")
        client_ref = data.get("client_reference_id")
        plan = _normalize_plan(str(data.get("metadata", {}).get("plan", "")))

        if payment_status != "paid":
            logger.warning("stripe.webhook_unpaid_session event_id=%s payment_status=%s", event_id, payment_status)
            return {"status": "ok"}

        # Defense-in-depth: metadata.user_id must match client_reference_id
        # (both set by our server at checkout creation; mismatch means tampering
        # or a malformed event we should not act on).
        if not user_id or not client_ref or str(user_id) != str(client_ref):
            logger.warning(
                "stripe.webhook_user_id_mismatch event_id=%s user_id=%s client_ref=%s",
                event_id, user_id, client_ref,
            )
            return {"status": "ok"}

        if user_id and plan in _PAID_PLANS:
            from uuid import UUID
            result = await session.execute(
                select(User).where(User.id == UUID(user_id))
            )
            user = result.scalar_one_or_none()

            if user:
                user.plan = plan
                user.stripe_customer_id = data.get("customer")
                await session.commit()
                logger.info("stripe.plan_upgraded user=%s plan=%s", user_id, plan)

                # Send upgrade email
                try:
                    from app.services.shared.email_service import send_upgrade_email
                    plan_name = str(PLANS.get(str(plan), {}).get("name", plan))
                    first_name = user.profile.first_name if user.profile else None
                    result = await send_upgrade_email(user.email, plan_name, first_name)
                    if result is None:
                        logger.warning("stripe.upgrade_email_failed user=%s plan=%s", user_id, plan)
                except Exception:
                    logger.exception("stripe.upgrade_email_error user=%s plan=%s", user_id, plan)
        else:
            logger.warning("stripe.webhook_invalid_metadata user_id=%s plan=%s", user_id, plan)

    return {"status": "ok"}


# ── RevenueCat webhook (mobile IAP) ────────────────────────────────────────────
#
# RevenueCat sends server-to-server notifications for all purchase lifecycle
# events (INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE,
# PRODUCT_CHANGE).  Docs: https://www.revenuecat.com/docs/webhooks
#
# Security:
#   - RevenueCat signs with an Authorization header we configure in the
#     dashboard (set to REVENUECAT_WEBHOOK_SECRET).
#   - We map the entitlement identifier ("starter" | "plus" | "premium")
#     directly to our User.plan column.
#   - app_user_id in the payload equals the backend User.id (we call
#     Purchases.logIn(user.id) from the mobile app).

_REVENUECAT_EVENT_UPGRADE = {
    "INITIAL_PURCHASE",
    "RENEWAL",
    "PRODUCT_CHANGE",
    "UNCANCELLATION",
    "NON_RENEWING_PURCHASE",
}
_REVENUECAT_EVENT_DOWNGRADE = {
    "EXPIRATION",
    "CANCELLATION",
    "BILLING_ISSUE",
}


@router.post("/revenuecat/webhook")
async def revenuecat_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
):
    """Handle RevenueCat server-side subscription events for the mobile app."""
    settings = get_settings()
    expected_secret = getattr(settings, "revenuecat_webhook_secret", None)

    if expected_secret:
        auth_header = request.headers.get("Authorization", "")
        if auth_header != f"Bearer {expected_secret}":
            logger.warning("revenuecat.webhook_bad_auth")
            raise HTTPException(status_code=401, detail="invalid signature")

    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")

    event = body.get("event", {}) if isinstance(body.get("event"), dict) else {}
    event_type = str(event.get("type", ""))
    app_user_id = event.get("app_user_id") or event.get("original_app_user_id")
    entitlement_ids = event.get("entitlement_ids") or []
    entitlement = (
        entitlement_ids[0] if isinstance(entitlement_ids, list) and entitlement_ids else None
    )

    if not app_user_id:
        logger.warning("revenuecat.webhook_missing_user event=%s", event_type)
        return {"status": "ignored"}

    from uuid import UUID

    try:
        user_uuid = UUID(str(app_user_id))
    except ValueError:
        logger.warning("revenuecat.webhook_bad_user_id user=%s", app_user_id)
        return {"status": "ignored"}

    result = await session.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("revenuecat.webhook_user_not_found user=%s", app_user_id)
        return {"status": "ignored"}

    if event_type in _REVENUECAT_EVENT_UPGRADE:
        plan = _normalize_plan(str(entitlement or "")) if entitlement else None
        if plan in _PAID_PLANS:
            user.plan = plan
            await session.commit()
            logger.info("revenuecat.plan_upgraded user=%s plan=%s event=%s", user.id, plan, event_type)
    elif event_type in _REVENUECAT_EVENT_DOWNGRADE:
        user.plan = "free"
        await session.commit()
        logger.info("revenuecat.plan_downgraded user=%s event=%s", user.id, event_type)
    else:
        logger.info("revenuecat.webhook_ignored_event type=%s user=%s", event_type, user.id)

    return {"status": "ok"}
