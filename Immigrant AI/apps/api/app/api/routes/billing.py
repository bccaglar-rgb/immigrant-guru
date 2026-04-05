"""Billing and plan management endpoints — Stripe-ready."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db_session
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

# Plan definitions
PLANS = {
    "free": {"name": "Free", "price": 0, "countries": 0, "features": ["Profile builder", "Short AI analysis", "Preview recommendations"]},
    "starter": {"name": "Starter", "price": 19, "countries": 1, "features": ["Full plan for 1 country", "Best visa recommendation", "Step-by-step roadmap", "Cost estimate", "Timeline estimate", "Basic document checklist"]},
    "plus": {"name": "Plus", "price": 29, "countries": 3, "popular": True, "features": ["Everything in Starter", "Up to 3 country comparisons", "Multiple visa alternatives", "Deeper analysis", "Expanded document guidance", "Better case preparation"]},
    "premium": {"name": "Premium", "price": 49, "countries": 999, "features": ["Everything in Plus", "Full strategic recommendation", "Priority AI guidance", "Advanced action plan", "Full path comparison", "Stronger case support", "Premium dashboard"]},
}


class CheckoutRequest(BaseModel):
    plan: str


class CheckoutResponse(BaseModel):
    checkout_url: str
    plan: str
    price: int


class PlanStatusResponse(BaseModel):
    plan: str
    plan_name: str
    price: int
    features: list[str]
    is_premium: bool


@router.get("/plans")
async def get_plans():
    """Return available pricing plans."""
    return {"plans": PLANS}


@router.get("/status", response_model=PlanStatusResponse)
async def get_billing_status(
    current_user: User = Depends(get_current_user),
):
    """Return current user's plan status."""
    plan_key = current_user.plan or "free"
    plan_info = PLANS.get(plan_key, PLANS["free"])

    return PlanStatusResponse(
        plan=plan_key,
        plan_name=plan_info["name"],
        price=plan_info["price"],
        features=plan_info["features"],
        is_premium=plan_key != "free",
    )


@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """Create a Stripe checkout session (or simulate for now).

    When Stripe is fully integrated, this will:
    1. Create a Stripe Checkout Session
    2. Return the Stripe redirect URL
    3. On webhook callback, update user plan

    For now: directly upgrades the plan (demo mode).
    """
    if body.plan not in PLANS or body.plan == "free":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan: {body.plan}",
        )

    plan_info = PLANS[body.plan]

    # TODO: Replace with real Stripe Checkout Session creation
    # stripe.checkout.Session.create(
    #     customer_email=current_user.email,
    #     line_items=[{"price": plan_info["stripe_price_id"], "quantity": 1}],
    #     mode="payment",
    #     success_url="https://immigrant.guru/analysis?upgraded=true",
    #     cancel_url="https://immigrant.guru/analysis?canceled=true",
    # )

    # Demo mode: directly upgrade
    current_user.plan = body.plan
    await session.commit()
    await session.refresh(current_user)

    # Send upgrade confirmation email
    try:
        from app.services.email_service import send_upgrade_email
        first_name = current_user.profile.first_name if current_user.profile else None
        await send_upgrade_email(current_user.email, plan_info["name"], first_name)
    except Exception:
        pass  # Email failure should never block upgrade

    logger.info("user.plan_upgraded user_id=%s plan=%s", current_user.id, body.plan)

    return {
        "success": True,
        "plan": body.plan,
        "plan_name": plan_info["name"],
        "price": plan_info["price"],
        "message": f"Upgraded to {plan_info['name']}. Your full plan is now unlocked.",
    }


@router.post("/webhook")
async def stripe_webhook():
    """Stripe webhook endpoint — to be implemented with real Stripe.

    Will handle:
    - checkout.session.completed
    - payment_intent.succeeded
    - payment_intent.payment_failed
    """
    # TODO: Implement Stripe webhook verification and handling
    return {"status": "ok"}
