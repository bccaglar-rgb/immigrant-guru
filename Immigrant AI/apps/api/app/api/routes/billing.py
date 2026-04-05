"""Billing and plan management — real Stripe Checkout integration."""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
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
    if body.plan not in PLANS or body.plan == "free":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid plan: {body.plan}")

    settings = get_settings()
    plan_info = PLANS[body.plan]

    # Map plan to Stripe price ID
    price_map = {
        "starter": settings.stripe_starter_price_id,
        "plus": settings.stripe_plus_price_id,
        "premium": settings.stripe_premium_price_id,
    }
    price_id = price_map.get(body.plan)

    if not price_id or not settings.stripe_secret_key:
        # Fallback: direct upgrade (demo mode)
        logger.warning("billing.fallback_demo plan=%s reason=no_stripe_config", body.plan)
        current_user.plan = body.plan
        await session.commit()
        await session.refresh(current_user)
        try:
            from app.services.email_service import send_upgrade_email
            first_name = current_user.profile.first_name if current_user.profile else None
            await send_upgrade_email(current_user.email, plan_info["name"], first_name)
        except Exception:
            pass
        return {
            "success": True,
            "mode": "demo",
            "plan": body.plan,
            "plan_name": plan_info["name"],
            "price": plan_info["price"],
            "message": f"Upgraded to {plan_info['name']}. Your full plan is now unlocked.",
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
                    "metadata[plan]": body.plan,
                    "metadata[user_id]": str(current_user.id),
                    "success_url": "https://immigrant.guru/analysis?upgraded=true",
                    "cancel_url": "https://immigrant.guru/analysis?canceled=true",
                },
            )
            checkout = resp.json()

            if resp.status_code not in (200, 201):
                logger.error("stripe.checkout_failed error=%s", checkout)
                raise HTTPException(status_code=500, detail="Payment session could not be created.")

            # Save session ID on user
            current_user.stripe_session_id = checkout["id"]
            await session.commit()

            logger.info("stripe.checkout_created user=%s plan=%s session=%s", current_user.id, body.plan, checkout["id"])

            return {
                "success": True,
                "mode": "stripe",
                "checkout_url": checkout["url"],
                "session_id": checkout["id"],
                "plan": body.plan,
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
    sig = request.headers.get("stripe-signature", "")

    # For now, parse without signature verification (add webhook secret later)
    import json
    try:
        event = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event.get("type", "")
    logger.info("stripe.webhook type=%s", event_type)

    if event_type == "checkout.session.completed":
        data = event.get("data", {}).get("object", {})
        user_id = data.get("metadata", {}).get("user_id")
        plan = data.get("metadata", {}).get("plan")
        customer_email = data.get("customer_email")

        if user_id and plan:
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
                    from app.services.email_service import send_upgrade_email
                    plan_name = PLANS.get(plan, {}).get("name", plan)
                    first_name = user.profile.first_name if user.profile else None
                    await send_upgrade_email(user.email, plan_name, first_name)
                except Exception:
                    pass

    return {"status": "ok"}
