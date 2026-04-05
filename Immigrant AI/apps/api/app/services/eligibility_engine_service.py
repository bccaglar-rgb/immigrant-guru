from __future__ import annotations

from typing import Any

from app.schemas.eligibility import (
    DeterministicEligibilityRequest,
    DeterministicEligibilityResponse,
    EligibilityOperator,
    EligibilityRule,
)


class EligibilityEngineService:
    """Deterministic eligibility evaluator based only on provided input data."""

    def evaluate(
        self,
        *,
        payload: DeterministicEligibilityRequest,
    ) -> DeterministicEligibilityResponse:
        profile = payload.user_profile
        requirements = payload.visa_requirements
        required_rules = requirements.get("required_rules", [])
        disqualifier_rules = requirements.get("disqualifier_rules", [])
        strength_rules = requirements.get("strength_rules", [])

        missing_requirements = [
            rule.label
            for rule in required_rules
            if not self._rule_matches(rule=rule, profile=profile)
        ]
        disqualifiers_triggered = [
            rule.label
            for rule in disqualifier_rules
            if self._rule_matches(rule=rule, profile=profile)
        ]

        eligible = len(disqualifiers_triggered) == 0 and len(missing_requirements) == 0
        strength_score = self._calculate_strength_score(
            profile=profile,
            required_rules=required_rules,
            strength_rules=strength_rules,
            disqualifiers_triggered=disqualifiers_triggered,
        )

        return DeterministicEligibilityResponse(
            eligible=eligible,
            missing_requirements=missing_requirements,
            disqualifiers_triggered=disqualifiers_triggered,
            strength_score=strength_score,
        )

    def _calculate_strength_score(
        self,
        *,
        profile: dict[str, Any],
        required_rules: list[EligibilityRule],
        strength_rules: list[EligibilityRule],
        disqualifiers_triggered: list[str],
    ) -> float:
        total_rules = len(required_rules) + len(strength_rules)
        if total_rules == 0:
            return 0.0

        satisfied_required = sum(
            1 for rule in required_rules if self._rule_matches(rule=rule, profile=profile)
        )
        satisfied_strength = sum(
            1 for rule in strength_rules if self._rule_matches(rule=rule, profile=profile)
        )

        score = ((satisfied_required + satisfied_strength) / total_rules) * 100.0
        if disqualifiers_triggered:
            score = min(score, 49.0)
        return round(max(0.0, min(100.0, score)), 1)

    def _rule_matches(
        self,
        *,
        rule: EligibilityRule,
        profile: dict[str, Any],
    ) -> bool:
        value = profile.get(rule.field)

        if rule.operator == EligibilityOperator.EXISTS:
            return value is not None and value != ""
        if rule.operator == EligibilityOperator.TRUTHY:
            return bool(value)
        if rule.operator == EligibilityOperator.FALSY:
            return not bool(value)

        if value is None:
            return False

        if rule.operator == EligibilityOperator.EQ:
            return value == rule.value
        if rule.operator == EligibilityOperator.NEQ:
            return value != rule.value
        if rule.operator == EligibilityOperator.IN:
            return value in self._coerce_iterable(rule.value)
        if rule.operator == EligibilityOperator.NOT_IN:
            return value not in self._coerce_iterable(rule.value)
        if rule.operator == EligibilityOperator.GTE:
            return self._coerce_number(value) >= self._coerce_number(rule.value)
        if rule.operator == EligibilityOperator.LTE:
            return self._coerce_number(value) <= self._coerce_number(rule.value)
        if rule.operator == EligibilityOperator.GT:
            return self._coerce_number(value) > self._coerce_number(rule.value)
        if rule.operator == EligibilityOperator.LT:
            return self._coerce_number(value) < self._coerce_number(rule.value)
        if rule.operator == EligibilityOperator.CONTAINS:
            if isinstance(value, str):
                return str(rule.value).lower() in value.lower()
            if isinstance(value, list):
                return rule.value in value
            return False

        return False

    @staticmethod
    def _coerce_iterable(value: Any) -> list[Any]:
        if isinstance(value, list):
            return value
        if isinstance(value, tuple):
            return list(value)
        return [value]

    @staticmethod
    def _coerce_number(value: Any) -> float:
        if isinstance(value, bool):
            return 1.0 if value else 0.0
        return float(value)
