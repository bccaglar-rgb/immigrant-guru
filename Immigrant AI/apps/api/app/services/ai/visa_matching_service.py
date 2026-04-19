from __future__ import annotations

from dataclasses import dataclass

from app.schemas.eligibility import DeterministicEligibilityRequest
from app.schemas.visa_match import (
    VisaBacklogLevel,
    VisaMatchConfidenceLevel,
    VisaMatchRequest,
    VisaMatchResponse,
    VisaQuotaPressure,
)
from app.services.ai.eligibility_engine_service import EligibilityEngineService


@dataclass
class VisaMatchingService:
    eligibility_engine: EligibilityEngineService

    def evaluate(
        self,
        *,
        payload: VisaMatchRequest,
    ) -> VisaMatchResponse:
        eligibility = self.eligibility_engine.evaluate(
            payload=DeterministicEligibilityRequest(
                user_profile=payload.user_profile,
                visa_requirements=payload.visa_requirements,
            )
        )
        profile_strength = eligibility.strength_score
        score = self._base_score(
            eligible=eligibility.eligible,
            profile_strength=profile_strength,
        )
        score += self._quota_adjustment(payload.market_context.quota_pressure)
        score += self._backlog_adjustment(
            backlog_level=payload.market_context.backlog_level,
            backlog_months=payload.market_context.backlog_months,
        )
        score -= min(len(eligibility.missing_requirements) * 4.0, 12.0)
        if eligibility.eligible and profile_strength >= 80:
            score += 8.0
        elif eligibility.eligible and profile_strength >= 65:
            score += 4.0
        if eligibility.eligible and not eligibility.missing_requirements:
            score += 4.0
        if eligibility.disqualifiers_triggered:
            score -= 15.0

        score = self._finalize_score(
            raw_score=score,
            eligible=eligibility.eligible,
        )
        confidence = self._confidence_level(
            eligible=eligibility.eligible,
            profile_strength=profile_strength,
            missing_requirements_count=len(eligibility.missing_requirements),
            disqualifiers_count=len(eligibility.disqualifiers_triggered),
            backlog_level=payload.market_context.backlog_level,
        )
        reasoning = self._build_reasoning(
            eligible=eligibility.eligible,
            profile_strength=profile_strength,
            quota_pressure=payload.market_context.quota_pressure,
            backlog_level=payload.market_context.backlog_level,
            missing_requirements_count=len(eligibility.missing_requirements),
            disqualifiers_count=len(eligibility.disqualifiers_triggered),
        )

        return VisaMatchResponse(
            match_score=score,
            confidence_level=confidence,
            reasoning=reasoning,
        )

    @staticmethod
    def _base_score(*, eligible: bool, profile_strength: float) -> float:
        if eligible:
            return 45.0 + (profile_strength * 0.45)
        return 15.0 + (profile_strength * 0.25)

    @staticmethod
    def _quota_adjustment(quota_pressure: VisaQuotaPressure) -> float:
        adjustments = {
            VisaQuotaPressure.LOW: 6.0,
            VisaQuotaPressure.MEDIUM: 0.0,
            VisaQuotaPressure.HIGH: -10.0,
        }
        return adjustments[quota_pressure]

    @staticmethod
    def _backlog_adjustment(
        *,
        backlog_level: VisaBacklogLevel,
        backlog_months: float | None,
    ) -> float:
        level_adjustments = {
            VisaBacklogLevel.LOW: 3.0,
            VisaBacklogLevel.MEDIUM: 0.0,
            VisaBacklogLevel.HIGH: -12.0,
        }
        adjustment = level_adjustments[backlog_level]
        if backlog_months is None:
            return adjustment
        if backlog_months >= 24:
            adjustment -= 8.0
        elif backlog_months >= 12:
            adjustment -= 4.0
        elif backlog_months >= 6:
            adjustment -= 2.0
        return adjustment

    @staticmethod
    def _finalize_score(*, raw_score: float, eligible: bool) -> float:
        score = max(0.0, min(100.0, raw_score))
        if not eligible:
            score = min(score, 40.0)
        return round(score, 1)

    @staticmethod
    def _confidence_level(
        *,
        eligible: bool,
        profile_strength: float,
        missing_requirements_count: int,
        disqualifiers_count: int,
        backlog_level: VisaBacklogLevel,
    ) -> VisaMatchConfidenceLevel:
        if not eligible or disqualifiers_count > 0:
            return VisaMatchConfidenceLevel.LOW
        if (
            profile_strength >= 75
            and missing_requirements_count == 0
            and backlog_level != VisaBacklogLevel.HIGH
        ):
            return VisaMatchConfidenceLevel.HIGH
        return VisaMatchConfidenceLevel.MEDIUM

    @staticmethod
    def _build_reasoning(
        *,
        eligible: bool,
        profile_strength: float,
        quota_pressure: VisaQuotaPressure,
        backlog_level: VisaBacklogLevel,
        missing_requirements_count: int,
        disqualifiers_count: int,
    ) -> str:
        eligibility_text = (
            "The profile clears the provided eligibility rules."
            if eligible
            else "The profile does not fully clear the provided eligibility rules."
        )

        if profile_strength >= 75:
            strength_text = "Profile strength is high on the provided rule set."
        elif profile_strength >= 50:
            strength_text = "Profile strength is moderate on the provided rule set."
        else:
            strength_text = "Profile strength is limited on the provided rule set."

        if backlog_level == VisaBacklogLevel.HIGH or quota_pressure == VisaQuotaPressure.HIGH:
            market_text = "Quota pressure or backlog materially reduces near-term match quality."
        elif backlog_level == VisaBacklogLevel.LOW and quota_pressure == VisaQuotaPressure.LOW:
            market_text = "Quota pressure and backlog are relatively favorable."
        else:
            market_text = "Quota pressure and backlog are within a moderate range."

        gaps: list[str] = []
        if missing_requirements_count:
            gaps.append(f"{missing_requirements_count} requirement gap(s) remain")
        if disqualifiers_count:
            gaps.append(f"{disqualifiers_count} disqualifier(s) were triggered")
        gap_text = ""
        if gaps:
            gap_text = " " + "; ".join(gaps) + "."

        return f"{eligibility_text} {strength_text} {market_text}{gap_text}".strip()
