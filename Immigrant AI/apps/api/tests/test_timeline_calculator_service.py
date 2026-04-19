from app.schemas.ai import (
    TimelineCalculatorRequest,
    TimelineCalculatorRiskLevel,
)
from app.services.ai.timeline_calculator_service import TimelineCalculatorService


def test_timeline_calculator_extends_wait_for_backlog() -> None:
    response = TimelineCalculatorService().calculate(
        payload=TimelineCalculatorRequest(
            visa_category="EB-2",
            country="India",
            backlog_data={"status": "delayed", "backlog_months": 18},
        )
    )

    assert response.estimated_wait_time == 24.0
    assert response.risk_level == TimelineCalculatorRiskLevel.HIGH
    assert "backlog pressure" in response.explanation


def test_timeline_calculator_keeps_current_cases_close_to_baseline() -> None:
    response = TimelineCalculatorService().calculate(
        payload=TimelineCalculatorRequest(
            visa_category="EB-1",
            country="Canada",
            backlog_data={"status": "current", "backlog_months": 1},
        )
    )

    assert response.estimated_wait_time == 5.0
    assert response.risk_level == TimelineCalculatorRiskLevel.LOW
    assert "minimal delay" in response.explanation
