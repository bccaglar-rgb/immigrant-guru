from __future__ import annotations

from dataclasses import dataclass

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.services.scoring_helpers import is_present, ratio_score


@dataclass(frozen=True)
class MissingInformationEvaluation:
    critical_items: list[str]
    helpful_items: list[str]
    profile_completeness_ratio: float
    case_completeness_ratio: float

    @property
    def all_items(self) -> list[str]:
        return [*self.critical_items, *self.helpful_items]


class MissingInformationService:
    """Evaluate profile and case gaps that materially weaken strategy quality."""

    _investor_program_keywords = (
        "invest",
        "startup",
        "entrepreneur",
        "business",
        "golden visa",
        "founder",
    )

    _profile_fields = (
        "nationality",
        "current_country",
        "education_level",
        "english_level",
        "profession",
        "years_of_experience",
        "available_capital",
        "criminal_record_flag",
        "prior_visa_refusal_flag",
        "relocation_timeline",
        "marital_status",
        "children_count",
        "preferred_language",
    )
    _case_fields = (
        "target_program",
        "current_stage",
        "notes",
    )

    def evaluate(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
    ) -> MissingInformationEvaluation:
        critical_items: list[str] = []
        helpful_items: list[str] = []

        if not is_present(profile.nationality):
            critical_items.append(
                "Nationality is missing, which materially limits pathway screening."
            )
        if not is_present(profile.current_country):
            critical_items.append(
                "Current country of residence is missing, which weakens location-aware guidance."
            )

        resolved_target_country = immigration_case.target_country or profile.target_country
        if not is_present(resolved_target_country):
            critical_items.append(
                "Target country is not defined in the profile or case."
            )

        if not is_present(profile.education_level):
            critical_items.append(
                "Education level is missing, which weakens eligibility positioning."
            )
        if not is_present(profile.english_level):
            critical_items.append(
                "English proficiency is missing, which affects route suitability assessment."
            )
        if not is_present(profile.profession):
            critical_items.append(
                "Profession is missing, which weakens skilled pathway comparison."
            )
        if not is_present(profile.years_of_experience):
            critical_items.append(
                "Years of experience are missing, which limits professional-strength assessment."
            )
        if profile.criminal_record_flag is None:
            critical_items.append(
                "Criminal record history has not been confirmed."
            )
        if profile.prior_visa_refusal_flag is None:
            critical_items.append(
                "Prior visa refusal history has not been confirmed."
            )

        if self._capital_is_critical(profile=profile, immigration_case=immigration_case):
            critical_items.append(
                "Available capital is missing for the current case direction."
            )
        elif not is_present(profile.available_capital):
            helpful_items.append(
                "Available capital is still missing, which reduces planning precision."
            )

        if not is_present(profile.relocation_timeline):
            helpful_items.append(
                "Relocation timeline is missing, so urgency and sequencing remain less precise."
            )
        if not is_present(profile.marital_status):
            helpful_items.append(
                "Marital status is missing, which may affect family-related planning."
            )
        if profile.children_count is None:
            helpful_items.append(
                "Children count is missing, which may affect dependent planning."
            )
        if not is_present(profile.preferred_language):
            helpful_items.append(
                "Preferred language is missing, which reduces communication personalization."
            )
        if not is_present(immigration_case.target_program):
            helpful_items.append(
                "Target pathway or program is not set on the case yet."
            )
        if not is_present(immigration_case.current_stage):
            helpful_items.append(
                "Current case stage is missing, so execution readiness is less clear."
            )
        if not is_present(immigration_case.notes):
            helpful_items.append(
                "Case notes are empty, so supporting context is limited."
            )

        profile_completed = sum(
            1
            for field_name in self._profile_fields
            if is_present(getattr(profile, field_name))
        )
        profile_total = len(self._profile_fields)
        if is_present(resolved_target_country):
            profile_completed += 1
        profile_completeness_ratio = ratio_score(profile_completed, profile_total + 1)

        case_completed = sum(
            1 for field_name in self._case_fields if is_present(getattr(immigration_case, field_name))
        )
        if is_present(resolved_target_country):
            case_completed += 1
        case_completeness_ratio = ratio_score(case_completed, len(self._case_fields) + 1)

        return MissingInformationEvaluation(
            critical_items=critical_items[:10],
            helpful_items=helpful_items[:10],
            profile_completeness_ratio=profile_completeness_ratio,
            case_completeness_ratio=case_completeness_ratio,
        )

    def _capital_is_critical(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
    ) -> bool:
        if is_present(profile.available_capital):
            return False

        target_program = (immigration_case.target_program or "").strip().lower()
        if any(keyword in target_program for keyword in self._investor_program_keywords):
            return True

        return immigration_case.target_country is not None and profile.relocation_timeline is not None
