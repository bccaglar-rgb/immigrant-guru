from app.schemas.ai import FinalDecisionRequest, RiskDetectionSeverity
from app.services.ai.final_decision_service import FinalDecisionService


def test_final_decision_never_contradicts_ineligibility() -> None:
    response = FinalDecisionService().decide(
        payload=FinalDecisionRequest(
            eligibility_result={
                "eligible": False,
                "missing_requirements": ["Qualifying degree is missing."],
                "disqualifiers_triggered": [],
                "strength_score": 52,
            },
            match_score=68,
            backlog_data={"status": "delayed", "backlog_months": 12},
            red_flags=[],
        )
    )

    assert response.final_recommendation == "Plan C"
    assert response.success_probability <= 40
    assert response.risk_level in {
        RiskDetectionSeverity.MEDIUM,
        RiskDetectionSeverity.HIGH,
    }


def test_final_decision_is_conservative_with_backlog_and_red_flags() -> None:
    response = FinalDecisionService().decide(
        payload=FinalDecisionRequest(
            eligibility_result={
                "eligible": True,
                "missing_requirements": [],
                "disqualifiers_triggered": [],
                "strength_score": 81,
            },
            match_score=78,
            backlog_data={"status": "delayed", "backlog_months": 18},
            red_flags=[
                {
                    "red_flag": "Insufficient funds",
                    "severity": "high",
                    "reason": "Funds are weak.",
                    "fix_suggestion": "Document stronger funds.",
                }
            ],
        )
    )

    assert response.final_recommendation in {"Plan B", "Plan C"}
    assert response.risk_level == RiskDetectionSeverity.MEDIUM
    assert response.success_probability < 78
    assert response.next_actions
