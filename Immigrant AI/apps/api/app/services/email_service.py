"""Email service using Resend API."""

import logging
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


async def send_email(to: str, subject: str, html: str) -> dict | None:
    """Send email via Resend API. Returns message ID or None on failure."""
    settings = get_settings()
    api_key = getattr(settings, "resend_api_key", None) or ""
    from_email = getattr(settings, "resend_from_email", None) or "Immigrant Guru <onboarding@resend.dev>"

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
# EMAIL TEMPLATES
# ============================================================

async def send_welcome_email(email: str, first_name: str | None = None) -> dict | None:
    """Send welcome email after registration."""
    name = first_name or "there"
    return await send_email(
        to=email,
        subject="Welcome to Immigrant Guru!",
        html=f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <img src="https://immigrant.guru/logo.png" alt="Immigrant Guru" style="width: 80px; margin-bottom: 24px;" />
            <h1 style="font-size: 24px; color: #111827; margin: 0 0 16px 0;">Hey {name}, welcome aboard!</h1>
            <p style="font-size: 16px; color: #6b7280; line-height: 1.6; margin: 0 0 24px 0;">
                Your Immigrant Guru account is ready. We're here to help you find
                the best immigration path based on your unique profile.
            </p>
            <p style="font-size: 16px; color: #6b7280; line-height: 1.6; margin: 0 0 24px 0;">
                Complete your profile and get your first AI analysis — it only takes 2 minutes.
            </p>
            <a href="https://immigrant.guru/onboarding" style="display: inline-block; background: #0071e3; color: white; padding: 12px 28px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px;">
                Start your plan
            </a>
            <p style="font-size: 13px; color: #9ca3af; margin-top: 32px;">
                Immigrant Guru — Navigate immigration with clarity.
            </p>
        </div>
        """,
    )


async def send_upgrade_email(email: str, plan_name: str, first_name: str | None = None) -> dict | None:
    """Send confirmation email after plan upgrade."""
    name = first_name or "there"
    return await send_email(
        to=email,
        subject=f"Your {plan_name} plan is unlocked!",
        html=f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <img src="https://immigrant.guru/logo.png" alt="Immigrant Guru" style="width: 80px; margin-bottom: 24px;" />
            <h1 style="font-size: 24px; color: #111827; margin: 0 0 16px 0;">Hey {name}, your {plan_name} plan is live!</h1>
            <p style="font-size: 16px; color: #6b7280; line-height: 1.6; margin: 0 0 24px 0;">
                Your full immigration plan is now unlocked. You can see your complete
                strategy, step-by-step roadmap, cost breakdown, and document checklist.
            </p>
            <a href="https://immigrant.guru/analysis" style="display: inline-block; background: #0071e3; color: white; padding: 12px 28px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px;">
                View your full plan
            </a>
            <p style="font-size: 13px; color: #9ca3af; margin-top: 32px;">
                Immigrant Guru — Navigate immigration with clarity.
            </p>
        </div>
        """,
    )


async def send_analysis_ready_email(email: str, visa_type: str, match_score: int, first_name: str | None = None) -> dict | None:
    """Send email when AI analysis is ready."""
    name = first_name or "there"
    return await send_email(
        to=email,
        subject="Your immigration analysis is ready",
        html=f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <img src="https://immigrant.guru/logo.png" alt="Immigrant Guru" style="width: 80px; margin-bottom: 24px;" />
            <h1 style="font-size: 24px; color: #111827; margin: 0 0 16px 0;">Hey {name}, your analysis is ready!</h1>
            <p style="font-size: 16px; color: #6b7280; line-height: 1.6; margin: 0 0 16px 0;">
                We analyzed your profile and found your top match:
            </p>
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px; margin: 0 0 24px 0;">
                <p style="font-size: 18px; font-weight: 600; color: #111827; margin: 0 0 4px 0;">{visa_type}</p>
                <p style="font-size: 14px; color: #0071e3; font-weight: 600; margin: 0;">{match_score}% match</p>
            </div>
            <a href="https://immigrant.guru/analysis" style="display: inline-block; background: #0071e3; color: white; padding: 12px 28px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px;">
                See your full analysis
            </a>
            <p style="font-size: 13px; color: #9ca3af; margin-top: 32px;">
                Immigrant Guru — Navigate immigration with clarity.
            </p>
        </div>
        """,
    )
