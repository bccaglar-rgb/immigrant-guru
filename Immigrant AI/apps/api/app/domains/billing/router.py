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
    "starter": {"name": "Starter", "price": 19, "countries": 1, "features": ["Full plan for 1 country", "Best visa recommendation", "Step-by-step roadmap", "Cost estimate", "Timeline estimate", "Basic document checklist"]},
    "plus": {"name": "Plus", "price": 29, "countries": 3, "popular": True, "features": ["Everything in Starter", "Up to 3 country comparisons", "Multiple visa alternatives", "Deeper analysis", "Expanded document guidance", "Better case preparation"]},
    "premium": {"name": "Premium", "price": 49, "countries": 999, "features": ["Everything in Plus", "Full strategic recommendation", "Priority AI guidance", "Advanced action plan", "Full path comparison", "Stronger case support", "Premium dashboard"]},
}


class CheckoutRequest(BaseModel):
    plan: str


def _normalize_plan(plan: str) -> str:
    return plan.strip().lower()


def _build_checkout_redirect_url(base_url: str, *, upgraded: bool) -> str:
    query = urlencode({"upgraded" if upgraded else "canceled": "true"})
    return f"{base_url.rstrip('/')}/analysis?{query}"


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


async def _claim_stripe_event(event_id: str, redis_url: str, ttl_seconds: int) -> bool:
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
        logger.exception("stripe.webhook_replay_guard_failed event_id=%s", event_id)
        return True
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


@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """Create a Stripe Checkout Session and return the URL."""
    normalized_plan = _normalize_plan(body.plan)

    if normalized_plan not in PLANS or normalized_plan == "free":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid plan: {body.plan}")

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
        if settings.app_env in {"staging", "production"}:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Billing is temporarily unavailable.",
            )

        # Fallback: direct upgrade (demo mode)
        logger.warning("billing.fallback_demo plan=%s reason=no_stripe_config", normalized_plan)
        current_user.plan = normalized_plan
        await session.commit()
        await session.refresh(current_user)
        try:
            from app.services.shared.email_service import send_upgrade_email
            first_name = current_user.profile.first_name if current_user.profile else None
            await send_upgrade_email(current_user.email, plan_name, first_name)
        except Exception:
            pass
        return {
            "success": True,
            "mode": "demo",
            "plan": normalized_plan,
            "plan_name": plan_name,
            "price": plan_info["price"],
            "message": f"Upgraded to {plan_name}. Your full plan is now unlocked.",
        }

    # Real Stripe Checkout Session
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.stripe.com/v1/checkout/sessions",
                auth=(settings.stripe_secret_key, ""),
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
                    "cancel_url": _build_checkout_redirect_url(settings.frontend_app_url, upgraded=False),
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

    if settings.stripe_webhook_secret:
        signature_header = request.headers.get("Stripe-Signature")
        if not signature_header or not _verify_stripe_signature(
            body,
            signature_header,
            settings.stripe_webhook_secret,
            settings.stripe_webhook_tolerance_seconds,
        ):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")
    elif settings.app_env in {"staging", "production"}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe webhook is not configured.",
        )

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
        user_id = data.get("metadata", {}).get("user_id")
        plan = _normalize_plan(str(data.get("metadata", {}).get("plan", "")))

        if user_id and plan in PLANS and plan != "free":
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
                    await send_upgrade_email(user.email, plan_name, first_name)
                except Exception:
                    pass
        else:
            logger.warning("stripe.webhook_invalid_metadata user_id=%s plan=%s", user_id, plan)

    return {"status": "ok"}
