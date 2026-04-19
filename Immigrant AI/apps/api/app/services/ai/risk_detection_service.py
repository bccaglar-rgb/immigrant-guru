from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from app.schemas.ai import (
    RiskDetectionItem,
    RiskDetectionRequest,
    RiskDetectionResponse,
    RiskDetectionSeverity,
)


class RiskDetectionService:
    """Deterministic rejection-risk detector based only on provided profile data."""

    def detect(self, *, payload: RiskDetectionRequest) -> RiskDetectionResponse:
        profile = payload.user_profile
        flags: list[RiskDetectionItem] = []

        available_capital = self._read_decimal(profile.get("available_capital"))
        years_of_experience = self._read_int(profile.get("years_of_experience"))
        target_country = self._read_text(profile.get("target_country"))
        profession = self._read_text(profile.get("profession"))
        english_level = self._read_text(profile.get("english_level"))
        education_level = self._read_text(profile.get("education_level"))
        criminal_record_flag = self._read_bool(profile.get("criminal_record_flag"))
        prior_visa_refusal_flag = self._read_bool(profile.get("prior_visa_refusal_flag"))
        relocation_timeline = self._read_text(profile.get("relocation_timeline"))
        nationality = self._read_text(profile.get("nationality"))

        if available_capital is None or available_capital < Decimal("15000"):
            flags.append(
                RiskDetectionItem(
                    red_flag="Insufficient funds",
                    severity=RiskDetectionSeverity.HIGH,
                    reason=(
                        "Available capital appears too low or is not documented clearly, which can weaken preparation strength and financial credibility."
                    ),
                    fix_suggestion=(
                        "Document stronger available funds or adjust the target route toward pathways with lower capital pressure."
                    ),
                )
            )

        if years_of_experience is None or years_of_experience < 2:
            flags.append(
                RiskDetectionItem(
                    red_flag="Weak experience profile",
                    severity=RiskDetectionSeverity.HIGH,
                    reason=(
                        "Professional experience appears limited, which can materially weaken skilled or merit-based pathway competitiveness."
                    ),
                    fix_suggestion=(
                        "Strengthen documented work experience before relying on experience-heavy pathways."
                    ),
                )
            )

        if not profession or not education_level:
            flags.append(
                RiskDetectionItem(
                    red_flag="Missing core profile evidence",
                    severity=RiskDetectionSeverity.HIGH,
                    reason=(
                        "Missing profession or education data makes eligibility assessment and document planning materially less reliable."
                    ),
                    fix_suggestion=(
                        "Complete profession and education details before using the result as a decision signal."
                    ),
                )
            )

        if english_level in {"none", "basic"}:
            flags.append(
                RiskDetectionItem(
                    red_flag="Weak language readiness",
                    severity=RiskDetectionSeverity.MEDIUM,
                    reason=(
                        "Low English proficiency can reduce competitiveness and create avoidable risk in many employment-based or points-based routes."
                    ),
                    fix_suggestion=(
                        "Raise language readiness or pivot to routes where language pressure is lower."
                    ),
                )
            )

        if relocation_timeline in {"immediately", "within_3_months"} and (
            not profession
            or years_of_experience is None
            or available_capital is None
        ):
            flags.append(
                RiskDetectionItem(
                    red_flag="Compressed timeline risk",
                    severity=RiskDetectionSeverity.MEDIUM,
                    reason=(
                        "The intended relocation timing appears aggressive relative to the current preparation quality and profile completeness."
                    ),
                    fix_suggestion=(
                        "Extend the planning timeline or complete the missing profile and funding evidence before treating the move as urgent."
                    ),
                )
            )

        if prior_visa_refusal_flag is True:
            flags.append(
                RiskDetectionItem(
                    red_flag="Prior refusal risk",
                    severity=RiskDetectionSeverity.HIGH,
                    reason=(
                        "A prior visa refusal can trigger additional scrutiny and should be treated as a material rejection risk until clarified."
                    ),
                    fix_suggestion=(
                        "Document the prior refusal context clearly and correct any underlying weaknesses before filing."
                    ),
                )
            )

        if criminal_record_flag is True:
            flags.append(
                RiskDetectionItem(
                    red_flag="Potential disqualifying record",
                    severity=RiskDetectionSeverity.HIGH,
                    reason=(
                        "A declared criminal record can create direct eligibility barriers or heightened review risk."
                    ),
                    fix_suggestion=(
                        "Do not treat the pathway as viable until the record is evaluated against the target country's rules."
                    ),
                )
            )

        if target_country == "United States" and (
            not education_level or years_of_experience is None or years_of_experience < 3
        ):
            flags.append(
                RiskDetectionItem(
                    red_flag="United States qualification pressure",
                    severity=RiskDetectionSeverity.MEDIUM,
                    reason=(
                        "The current profile may not be strong enough yet for common U.S. employment or merit-based routes."
                    ),
                    fix_suggestion=(
                        "Strengthen degree, experience, and evidence quality before treating U.S. routes as primary."
                    ),
                )
            )

        if target_country == "Canada" and english_level in {None, "", "none", "basic"}:
            flags.append(
                RiskDetectionItem(
                    red_flag="Canada language competitiveness risk",
                    severity=RiskDetectionSeverity.MEDIUM,
                    reason=(
                        "Language competitiveness is often central in Canada-focused pathways, so weak language readiness can reduce viability."
                    ),
                    fix_suggestion=(
                        "Prioritize language test readiness before assuming strong Canadian pathway competitiveness."
                    ),
                )
            )

        if target_country == "Germany" and not profession:
            flags.append(
                RiskDetectionItem(
                    red_flag="Germany role-definition risk",
                    severity=RiskDetectionSeverity.MEDIUM,
                    reason=(
                        "Germany-focused skilled routes often depend on a clearly defined profession and role alignment."
                    ),
                    fix_suggestion=(
                        "Clarify the target role and profession before leaning on Germany as the primary destination."
                    ),
                )
            )

        if not nationality:
            flags.append(
                RiskDetectionItem(
                    red_flag="Missing nationality data",
                    severity=RiskDetectionSeverity.LOW,
                    reason=(
                        "Nationality can affect document requirements, pathway nuances, and evidence preparation."
                    ),
                    fix_suggestion=(
                        "Add nationality to improve country-specific risk interpretation."
                    ),
                )
            )

        return RiskDetectionResponse(red_flags=flags)

    @staticmethod
    def _read_text(value: Any) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized if normalized else None

    @staticmethod
    def _read_bool(value: Any) -> bool | None:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "yes", "1"}:
                return True
            if lowered in {"false", "no", "0"}:
                return False
        return None

    @staticmethod
    def _read_int(value: Any) -> int | None:
        if value is None or value == "":
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _read_decimal(value: Any) -> Decimal | None:
        if value is None or value == "":
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return None
