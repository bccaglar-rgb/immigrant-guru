"""Email service using Resend API — premium, warm, conversion-focused."""

from __future__ import annotations

import logging
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"

# Shared email wrapper
_WRAPPER_START = """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; max-width: 560px; margin: 0 auto; padding: 48px 24px;">
  <img src="https://immigrant.guru/logo.png" alt="Immigrant Guru" style="width: 72px; margin-bottom: 32px;" />
"""

_WRAPPER_END = """
  <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
    <p style="font-size: 12px; color: #9ca3af; line-height: 1.6; margin: 0;">
      This email was sent from an unmonitored address.<br />
      For support, contact <a href="mailto:support@immigrant.guru" style="color: #9ca3af;">support@immigrant.guru</a>
    </p>
    <p style="font-size: 11px; color: #d1d5db; margin: 12px 0 0 0;">
      &copy; 2026 Immigrant Guru
    </p>
  </div>
</div>
"""

_CTA_STYLE = "display: inline-block; background: #0071e3; color: #ffffff; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px;"


async def send_email(to: str, subject: str, html: str) -> dict | None:
    """Send email via Resend API. Returns message ID or None on failure."""
    settings = get_settings()
    api_key = getattr(settings, "resend_api_key", None) or ""
    from_email = getattr(settings, "resend_from_email", None) or "Immigrant Guru <noreply@immigrant.guru>"

    if not api_key:
        logger.warning("email.skipped reason=no_api_key to=%s subject=%s", to, subject)
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": from_email,
                    "to": to,
                    "subject": subject,
                    "html": html,
                    "reply_to": "noreply@immigrant.guru",
                    "headers": {
                        "X-Auto-Response-Suppress": "All",
                    },
                },
            )
            data = response.json()

            if response.status_code in (200, 201):
                logger.info("email.sent to=%s subject=%s id=%s", to, subject, data.get("id"))
                return data
            else:
                logger.error("email.failed to=%s status=%s body=%s", to, response.status_code, data)
                return None
    except Exception as e:
        logger.error("email.error to=%s error=%s", to, str(e))
        return None


# ============================================================
# 1. WELCOME EMAIL
# ============================================================

async def send_welcome_email(email: str, first_name: str | None = None) -> dict | None:
    """Send welcome email after registration."""
    name = first_name or "there"
    return await send_email(
        to=email,
        subject="Welcome to Immigrant Guru — let's find your path",
        html=f"""{_WRAPPER_START}
  <h1 style="font-size: 22px; font-weight: 600; color: #111827; margin: 0 0 16px 0; line-height: 1.3;">
    Hey {name}, welcome to Immigrant Guru.
  </h1>

  <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 12px 0;">
    We're glad you're here.
  </p>

  <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 12px 0;">
    Starting an immigration journey can feel overwhelming, but it doesn't have to be.
  </p>

  <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 28px 0;">
    Complete your profile, and we'll give you your first personalized AI analysis
    based on your background and goals. It only takes a couple of minutes.
  </p>

  <a href="https://immigrant.guru/onboarding" style="{_CTA_STYLE}">
    Start your plan
  </a>
{_WRAPPER_END}""",
    )


# ============================================================
# 2. PASSWORD RESET EMAIL
# ============================================================

async def send_password_reset_email(email: str, code: str) -> dict | None:
    """Send password reset code."""
    return await send_email(
        to=email,
        subject="Your password reset code",
        html=f"""{_WRAPPER_START}
  <h1 style="font-size: 22px; font-weight: 600; color: #111827; margin: 0 0 16px 0; line-height: 1.3;">
    Reset your password
  </h1>

  <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 24px 0;">
    We received a request to reset your password. Use the code below to continue:
  </p>

  <div style="background: #f0f9ff; border: 2px solid #0071e3; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px 0;">
    <p style="font-size: 36px; font-weight: 700; color: #0071e3; margin: 0; letter-spacing: 8px;">{code}</p>
  </div>

  <p style="font-size: 14px; color: #9ca3af; line-height: 1.6; margin: 0;">
    For your security, this code expires in 15 minutes.<br />
    If you didn't request this, no action is needed.
  </p>
{_WRAPPER_END}""",
    )


# ============================================================
# 3. UPGRADE / PAYMENT SUCCESS EMAIL
# ============================================================

async def send_upgrade_email(email: str, plan_name: str, first_name: str | None = None) -> dict | None:
    """Send confirmation email after plan upgrade."""
    name = first_name or "there"
    return await send_email(
        to=email,
        subject=f"Your {plan_name} plan is now unlocked",
        html=f"""{_WRAPPER_START}
  <h1 style="font-size: 22px; font-weight: 600; color: #111827; margin: 0 0 16px 0; line-height: 1.3;">
    Hey {name}, great news.
  </h1>

  <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 12px 0;">
    Your <strong>{plan_name}</strong> plan is now active.
  </p>

  <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 12px 0;">
    Your full immigration plan is ready for you. You can now review your
    recommended path, compare your options, and move forward with a clearer strategy.
  </p>

  <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 28px 0;">
    Your next step is ready.
  </p>

  <a href="https://immigrant.guru/analysis" style="{_CTA_STYLE}">
    View your plan
  </a>
{_WRAPPER_END}""",
    )


# ============================================================
# 4. ANALYSIS READY EMAIL
# ============================================================

async def send_analysis_ready_email(email: str, visa_type: str, match_score: int, first_name: str | None = None) -> dict | None:
    """Send email when AI analysis is ready."""
    name = first_name or "there"
    return await send_email(
        to=email,
        subject="Your immigration analysis is ready",
        html=f"""{_WRAPPER_START}
  <h1 style="font-size: 22px; font-weight: 600; color: #111827; margin: 0 0 16px 0; line-height: 1.3;">
    Hey {name}, your analysis is ready.
  </h1>

  <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 20px 0;">
    We analyzed your profile and found your top match:
  </p>

  <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px; margin: 0 0 24px 0;">
    <p style="font-size: 18px; font-weight: 600; color: #111827; margin: 0 0 4px 0;">{visa_type}</p>
    <p style="font-size: 14px; color: #0071e3; font-weight: 600; margin: 0;">{match_score}% match</p>
  </div>

  <p style="font-size: 15px; color: #4b5563; line-height: 1.7; margin: 0 0 28px 0;">
    See your full analysis to explore your options and next steps.
  </p>

  <a href="https://immigrant.guru/analysis" style="{_CTA_STYLE}">
    See your analysis
  </a>
{_WRAPPER_END}""",
    )
