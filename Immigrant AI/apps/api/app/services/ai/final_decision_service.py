from __future__ import annotations

from app.schemas.ai import (
    FinalDecisionRequest,
    FinalDecisionResponse,
    RiskDetectionSeverity,
)


class FinalDecisionService:
    """Conservative deterministic decision layer over eligibility, match, backlog, and risks."""

    def decide(
        self,
        *,
        payload: FinalDecisionRequest,
    ) -> FinalDecisionResponse:
        eligible = bool(payload.eligibility_result.get("eligible", False))
        missing_requirements = list(
            payload.eligibility_result.get("missing_requirements", []) or []
        )
        disqualifiers = list(
            payload.eligibility_result.get("disqualifiers_triggered", []) or []
        )
        strength_score = self._coerce_float(
            payload.eligibility_result.get("strength_score"),
            default=0.0,
        )

        backlog_status = str(payload.backlog_data.get("status", "delayed")).strip().lower()
        backlog_months = self._coerce_float(
            payload.backlog_data.get("backlog_months"),
            default=0.0,
        )

        success_probability = min(max(payload.match_score, 0.0), 100.0)
        if not eligible or disqualifiers:
            success_probability = min(success_probability, 40.0)
        if backlog_status != "current":
            success_probability -= 6.0
        if backlog_months >= 24:
            success_probability -= 10.0
        elif backlog_months >= 12:
            success_probability -= 6.0
        elif backlog_months >= 6:
            success_probability -= 3.0

        high_flags = sum(1 for flag in payload.red_flags if flag.severity == RiskDetectionSeverity.HIGH)
        medium_flags = sum(1 for flag in payload.red_flags if flag.severity == RiskDetectionSeverity.MEDIUM)
        success_probability -= high_flags * 8.0
        success_probability -= medium_flags * 4.0
        if not eligible and missing_requirements:
            success_probability -= min(len(missing_requirements) * 3.0, 12.0)

        success_probability = round(min(max(success_probability, 0.0), 100.0), 1)

        risk_level = self._risk_level(
            eligible=eligible,
            disqualifiers_count=len(disqualifiers),
            high_flags=high_flags,
            medium_flags=medium_flags,
            backlog_status=backlog_status,
            backlog_months=backlog_months,
        )
        final_recommendation = self._recommendation(
            eligible=eligible,
            success_probability=success_probability,
            risk_level=risk_level,
        )
        next_actions = self._next_actions(
            eligible=eligible,
            missing_requirements=missing_requirements,
            disqualifiers=disqualifiers,
            red_flags=payload.red_flags,
            backlog_status=backlog_status,
            strength_score=strength_score,
        )

        return FinalDecisionResponse(
            final_recommendation=final_recommendation,
            risk_level=risk_level,
            success_probability=success_probability,
            next_actions=next_actions,
        )

    @staticmethod
    def _coerce_float(value: object, *, default: float) -> float:
        try:
            if value is None:
                return default
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _risk_level(
        *,
        eligible: bool,
        disqualifiers_count: int,
        high_flags: int,
        medium_flags: int,
        backlog_status: str,
        backlog_months: float,
    ) -> RiskDetectionSeverity:
        if (
            not eligible
            or disqualifiers_count > 0
            or high_flags >= 2
            or backlog_months >= 24
        ):
            return RiskDetectionSeverity.HIGH
        if high_flags == 1 or medium_flags > 0 or backlog_status != "current":
            return RiskDetectionSeverity.MEDIUM
        return RiskDetectionSeverity.LOW

    @staticmethod
    def _recommendation(
        *,
        eligible: bool,
        success_probability: float,
        risk_level: RiskDetectionSeverity,
    ) -> str:
        if not eligible:
            return "Plan C"
        if risk_level == RiskDetectionSeverity.LOW and success_probability >= 70:
            return "Plan A"
        if success_probability >= 45:
            return "Plan B"
        return "Plan C"

    @staticmethod
    def _next_actions(
        *,
        eligible: bool,
        missing_requirements: list[str],
        disqualifiers: list[str],
        red_flags: list,
        backlog_status: str,
        strength_score: float,
    ) -> list[str]:
        actions: list[str] = []

        if not eligible:
            if disqualifiers:
                actions.append(f"Resolve or legally assess the disqualifier: {disqualifiers[0]}.")
            if missing_requirements:
                actions.append(f"Close the highest-priority requirement gap: {missing_requirements[0]}.")
            actions.append("Do not treat the primary route as filing-ready until eligibility gaps are closed.")
        else:
            actions.append("Validate the strongest currently eligible route against the latest evidence set.")

        for flag in red_flags[:2]:
            actions.append(flag.fix_suggestion)

        if backlog_status != "current":
            actions.append("Account for backlog delay in planning and avoid relying on an optimistic filing timeline.")
        if strength_score < 60:
            actions.append("Strengthen profile evidence before escalating to higher-risk pathways.")

        deduped: list[str] = []
        seen: set[str] = set()
        for action in actions:
            normalized = action.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(normalized)

        return deduped[:8] or ["Collect clearer eligibility and risk data before making a filing decision."]
