"""Admin analytics endpoints — revenue, cases, growth, system health.

Lightweight computed views. No new tables; data is derived from User,
ImmigrationCase, Document. Used by the admin console.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_admin_user
from app.db.session import get_db_session
from app.models.document import Document
from app.models.enums import DocumentUploadStatus, ImmigrationCaseStatus
from app.models.immigration_case import ImmigrationCase
from app.models.user import User

router = APIRouter(prefix="/admin/analytics", tags=["admin-analytics"])


# Plan prices — source of truth for the revenue estimate. Change here if Stripe
# prices change. Free plan is not counted.
_PLAN_PRICES_USD: dict[str, int] = {
    "starter": 19,
    "plus": 29,
    "premium": 49,
}


class RevenueByPlan(BaseModel):
    plan: str
    price_usd: int
    user_count: int
    revenue_usd: int


class RevenueAnalytics(BaseModel):
    total_revenue_usd: int
    paid_user_count: int
    free_user_count: int
    arpu_usd: float  # Average revenue per paying user
    by_plan: list[RevenueByPlan]


class CaseStatusBreakdown(BaseModel):
    status: str
    count: int


class RecentCaseEntry(BaseModel):
    id: str
    title: str | None
    status: str
    user_email: str | None
    created_at: datetime
    updated_at: datetime


class CaseAnalytics(BaseModel):
    total_cases: int
    active_cases: int
    by_status: list[CaseStatusBreakdown]
    recent: list[RecentCaseEntry]


class DailySignup(BaseModel):
    date: str  # YYYY-MM-DD
    signups: int


class GrowthAnalytics(BaseModel):
    range_days: int
    total_in_range: int
    daily: list[DailySignup]


class DocumentQueueSummary(BaseModel):
    pending: int
    uploaded: int
    processing: int
    failed: int


class SystemHealth(BaseModel):
    total_users: int
    total_cases: int
    total_documents: int
    document_queue: DocumentQueueSummary
    generated_at: datetime


@router.get("/revenue", response_model=RevenueAnalytics, summary="Revenue estimate + plan breakdown")
async def get_revenue_analytics(
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
) -> RevenueAnalytics:
    plan_res = await session.execute(
        select(User.plan, func.count(User.id)).group_by(User.plan)
    )
    counts: dict[str, int] = {row[0] or "free": row[1] for row in plan_res.all()}

    breakdown: list[RevenueByPlan] = []
    total_revenue = 0
    paid_user_count = 0
    for plan, price in _PLAN_PRICES_USD.items():
        c = counts.get(plan, 0)
        revenue = c * price
        total_revenue += revenue
        paid_user_count += c
        breakdown.append(
            RevenueByPlan(plan=plan, price_usd=price, user_count=c, revenue_usd=revenue)
        )

    free_user_count = counts.get("free", 0)
    arpu = (total_revenue / paid_user_count) if paid_user_count else 0.0

    return RevenueAnalytics(
        total_revenue_usd=total_revenue,
        paid_user_count=paid_user_count,
        free_user_count=free_user_count,
        arpu_usd=round(arpu, 2),
        by_plan=breakdown,
    )


@router.get("/cases", response_model=CaseAnalytics, summary="Case totals + status breakdown + recent")
async def get_case_analytics(
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
) -> CaseAnalytics:
    total_res = await session.execute(select(func.count(ImmigrationCase.id)))
    total = total_res.scalar_one() or 0

    active_res = await session.execute(
        select(func.count(ImmigrationCase.id)).where(
            ImmigrationCase.status == ImmigrationCaseStatus.ACTIVE
        )
    )
    active = active_res.scalar_one() or 0

    status_res = await session.execute(
        select(ImmigrationCase.status, func.count(ImmigrationCase.id)).group_by(
            ImmigrationCase.status
        )
    )
    by_status = [
        CaseStatusBreakdown(status=str(row[0]), count=row[1]) for row in status_res.all()
    ]

    recent_res = await session.execute(
        select(ImmigrationCase)
        .options(selectinload(ImmigrationCase.user))
        .order_by(ImmigrationCase.updated_at.desc())
        .limit(15)
    )
    recent_cases = recent_res.scalars().unique().all()
    recent = [
        RecentCaseEntry(
            id=str(c.id),
            title=getattr(c, "title", None) or getattr(c, "name", None),
            status=str(c.status),
            user_email=c.user.email if c.user else None,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in recent_cases
    ]

    return CaseAnalytics(
        total_cases=total,
        active_cases=active,
        by_status=by_status,
        recent=recent,
    )


@router.get("/growth", response_model=GrowthAnalytics, summary="Daily signups (last N days)")
async def get_growth_analytics(
    days: int = 30,
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
) -> GrowthAnalytics:
    days = max(1, min(days, 90))
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    # Group signups by calendar date (UTC). Portable across Postgres/SQLite.
    date_expr = func.date(User.created_at)
    res = await session.execute(
        select(date_expr, func.count(User.id))
        .where(User.created_at >= start)
        .group_by(date_expr)
    )
    counts: dict[str, int] = {}
    for row in res.all():
        key = row[0] if isinstance(row[0], str) else row[0].isoformat()
        counts[key] = row[1]

    daily: list[DailySignup] = []
    total_in_range = 0
    for i in range(days):
        day = (start + timedelta(days=i)).date().isoformat()
        n = counts.get(day, 0)
        total_in_range += n
        daily.append(DailySignup(date=day, signups=n))

    return GrowthAnalytics(range_days=days, total_in_range=total_in_range, daily=daily)


@router.get("/system", response_model=SystemHealth, summary="System-wide counts + document queue")
async def get_system_health(
    _: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_db_session),
) -> SystemHealth:
    total_users_res = await session.execute(select(func.count(User.id)))
    total_cases_res = await session.execute(select(func.count(ImmigrationCase.id)))
    total_docs_res = await session.execute(select(func.count(Document.id)))

    queue_res = await session.execute(
        select(Document.upload_status, func.count(Document.id)).group_by(
            Document.upload_status
        )
    )
    queue_counts: dict[str, int] = {str(row[0]): row[1] for row in queue_res.all()}

    queue = DocumentQueueSummary(
        pending=queue_counts.get(DocumentUploadStatus.PENDING.value, 0),
        uploaded=queue_counts.get(DocumentUploadStatus.UPLOADED.value, 0),
        processing=queue_counts.get(DocumentUploadStatus.PROCESSING.value, 0),
        failed=queue_counts.get(DocumentUploadStatus.FAILED.value, 0),
    )

    return SystemHealth(
        total_users=total_users_res.scalar_one() or 0,
        total_cases=total_cases_res.scalar_one() or 0,
        total_documents=total_docs_res.scalar_one() or 0,
        document_queue=queue,
        generated_at=datetime.now(timezone.utc),
    )
