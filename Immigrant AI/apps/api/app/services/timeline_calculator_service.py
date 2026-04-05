from __future__ import annotations

from app.schemas.ai import (
    TimelineCalculatorRequest,
    TimelineCalculatorResponse,
    TimelineCalculatorRiskLevel,
)


class TimelineCalculatorService:
    """Deterministic wait-time calculator from visa category, country, and backlog data."""

    _base_wait_by_category = {
        "EB-1": 4.0,
        "EB-2": 6.0,
        "EB-3": 8.0,
        "EB-4": 10.0,
        "EB-5": 12.0,
    }

    def calculate(
        self,
        *,
        payload: TimelineCalculatorRequest,
    ) -> TimelineCalculatorResponse:
        category = payload.visa_category.strip().upper()
        base_wait = self._base_wait_by_category.get(category, 8.0)
        backlog_status = str(payload.backlog_data.get("status", "delayed")).strip().lower()
        backlog_months = self._coerce_months(payload.backlog_data.get("backlog_months"))

        estimated_wait_time = base_wait
        if backlog_status == "current":
            estimated_wait_time += min(backlog_months, 2.0)
        else:
            estimated_wait_time += max(backlog_months, 6.0)

        risk_level = self._risk_level(
            backlog_status=backlog_status,
            backlog_months=backlog_months,
        )
        explanation = self._explanation(
            category=category,
            country=payload.country,
            backlog_status=backlog_status,
            backlog_months=backlog_months,
            estimated_wait_time=estimated_wait_time,
        )

        return TimelineCalculatorResponse(
            estimated_wait_time=round(min(max(estimated_wait_time, 0.0), 240.0), 1),
            risk_level=risk_level,
            explanation=explanation,
        )

    @staticmethod
    def _coerce_months(value: object) -> float:
        try:
            if value is None:
                return 0.0
            return max(float(value), 0.0)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _risk_level(
        *,
        backlog_status: str,
        backlog_months: float,
    ) -> TimelineCalculatorRiskLevel:
        if backlog_status == "current" and backlog_months <= 2:
            return TimelineCalculatorRiskLevel.LOW
        if backlog_months >= 18 or backlog_status == "delayed" and backlog_months >= 12:
            return TimelineCalculatorRiskLevel.HIGH
        return TimelineCalculatorRiskLevel.MEDIUM

    @staticmethod
    def _explanation(
        *,
        category: str,
        country: str,
        backlog_status: str,
        backlog_months: float,
        estimated_wait_time: float,
    ) -> str:
        if backlog_status == "current":
            return (
                f"{category} for {country} appears current, so the estimate stays near baseline "
                f"with minimal delay at about {round(estimated_wait_time, 1)} months."
            )
        return (
            f"{category} for {country} shows backlog pressure, so the baseline timeline is extended "
            f"to about {round(estimated_wait_time, 1)} months."
        )
