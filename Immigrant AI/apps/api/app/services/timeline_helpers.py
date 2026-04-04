from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TimelineStepTemplate:
    step_name: str
    base_duration_months: float
    description: str
    phase: str


@dataclass(frozen=True)
class TimelineDefinition:
    key: str
    steps: tuple[TimelineStepTemplate, ...]


GENERIC_STEPS = (
    TimelineStepTemplate(
        step_name="Eligibility review and profile positioning",
        base_duration_months=1.5,
        description=(
            "Confirm pathway fit, close high-impact profile gaps, and define the evidence "
            "strategy before formal preparation."
        ),
        phase="preparation",
    ),
    TimelineStepTemplate(
        step_name="Document collection and preparation",
        base_duration_months=2.0,
        description=(
            "Collect identity, education, employment, financial, and pathway-specific support "
            "documents in filing-ready form."
        ),
        phase="preparation",
    ),
    TimelineStepTemplate(
        step_name="Application assembly and filing",
        base_duration_months=1.0,
        description=(
            "Finalize forms, review completeness, and submit the application or profile to the "
            "relevant authority."
        ),
        phase="filing",
    ),
    TimelineStepTemplate(
        step_name="Government processing and review",
        base_duration_months=6.0,
        description=(
            "Wait through the main agency review period, including queueing, document review, "
            "and possible clarification requests."
        ),
        phase="review",
    ),
    TimelineStepTemplate(
        step_name="Interview or final decision closure",
        base_duration_months=1.5,
        description=(
            "Handle final verification, interview, medical, or decision issuance steps needed "
            "to close the case."
        ),
        phase="decision",
    ),
)

SKILLED_STEPS = (
    TimelineStepTemplate(
        step_name="Eligibility review and profile positioning",
        base_duration_months=1.2,
        description=(
            "Assess skilled-pathway fit, strengthen credentials, and verify the competitiveness "
            "of the professional profile."
        ),
        phase="preparation",
    ),
    TimelineStepTemplate(
        step_name="Language, education, and experience evidence",
        base_duration_months=2.0,
        description=(
            "Prepare language results, education evidence, and work-history documentation needed "
            "for a skilled migration pathway."
        ),
        phase="preparation",
    ),
    TimelineStepTemplate(
        step_name="Profile submission or case filing",
        base_duration_months=0.8,
        description=(
            "Create the government profile or submit the employment-based filing package."
        ),
        phase="filing",
    ),
    TimelineStepTemplate(
        step_name="Eligibility review and processing queue",
        base_duration_months=5.5,
        description=(
            "Move through the core processing queue while the authority reviews profile strength "
            "and supporting evidence."
        ),
        phase="review",
    ),
    TimelineStepTemplate(
        step_name="Final request handling and decision",
        base_duration_months=1.2,
        description=(
            "Address any last-mile requests, biometric steps, or final decision issuance."
        ),
        phase="decision",
    ),
)

INVESTOR_STEPS = (
    TimelineStepTemplate(
        step_name="Capital readiness and source-of-funds preparation",
        base_duration_months=2.5,
        description=(
            "Organize capital evidence, source-of-funds records, and business rationale before "
            "formal investor filing."
        ),
        phase="preparation",
    ),
    TimelineStepTemplate(
        step_name="Investment structure and compliance preparation",
        base_duration_months=2.0,
        description=(
            "Prepare business, investment, or entity-formation materials and confirm local "
            "compliance expectations."
        ),
        phase="preparation",
    ),
    TimelineStepTemplate(
        step_name="Application filing",
        base_duration_months=1.0,
        description=(
            "Submit the investor or entrepreneur application with the required evidence package."
        ),
        phase="filing",
    ),
    TimelineStepTemplate(
        step_name="Due diligence and authority review",
        base_duration_months=8.0,
        description=(
            "Complete government review, due diligence, and any clarifications tied to financial "
            "or business documentation."
        ),
        phase="review",
    ),
    TimelineStepTemplate(
        step_name="Approval and relocation execution",
        base_duration_months=2.0,
        description=(
            "Handle approval issuance, settlement logistics, and final compliance steps."
        ),
        phase="decision",
    ),
)

STUDENT_STEPS = (
    TimelineStepTemplate(
        step_name="School selection and admission readiness",
        base_duration_months=2.0,
        description=(
            "Prepare academic materials, target programs, and complete the core admission package."
        ),
        phase="preparation",
    ),
    TimelineStepTemplate(
        step_name="Funding and supporting document preparation",
        base_duration_months=1.5,
        description=(
            "Collect financial support evidence, identity records, and study-plan documentation."
        ),
        phase="preparation",
    ),
    TimelineStepTemplate(
        step_name="Study visa filing",
        base_duration_months=0.8,
        description=(
            "Submit the study permit or visa package once the school and financial evidence are ready."
        ),
        phase="filing",
    ),
    TimelineStepTemplate(
        step_name="Visa processing and review",
        base_duration_months=4.5,
        description=(
            "Move through standard government review of the study application and supporting proof."
        ),
        phase="review",
    ),
    TimelineStepTemplate(
        step_name="Pre-departure and final issuance",
        base_duration_months=1.0,
        description=(
            "Complete final decision, onboarding, and departure preparation steps."
        ),
        phase="decision",
    ),
)

FAMILY_STEPS = (
    TimelineStepTemplate(
        step_name="Relationship and eligibility evidence preparation",
        base_duration_months=1.8,
        description=(
            "Prepare relationship records, civil documents, and sponsorship support evidence."
        ),
        phase="preparation",
    ),
    TimelineStepTemplate(
        step_name="Case document assembly",
        base_duration_months=1.6,
        description=(
            "Assemble forms, translations, and supporting records needed for the family-based filing."
        ),
        phase="preparation",
    ),
    TimelineStepTemplate(
        step_name="Application filing",
        base_duration_months=1.0,
        description=(
            "Submit the family or dependent visa application package."
        ),
        phase="filing",
    ),
    TimelineStepTemplate(
        step_name="Relationship review and queue processing",
        base_duration_months=7.0,
        description=(
            "Wait through the review queue while eligibility and relationship evidence are assessed."
        ),
        phase="review",
    ),
    TimelineStepTemplate(
        step_name="Interview and final decision",
        base_duration_months=1.8,
        description=(
            "Complete interview, medical, or final issuance steps tied to the family case."
        ),
        phase="decision",
    ),
)

COUNTRY_REVIEW_ADJUSTMENTS = {
    "canada": 0.92,
    "germany": 0.9,
    "united states": 1.12,
    "usa": 1.12,
    "uk": 1.0,
    "united kingdom": 1.0,
    "australia": 1.05,
    "portugal": 1.08,
}


def coerce_value(value: object) -> str | None:
    if value is None:
        return None
    if hasattr(value, "value"):
        return str(getattr(value, "value"))
    text = str(value).strip()
    return text or None


def round_months(value: float) -> float:
    return round(max(0.0, min(240.0, value)), 1)


def keywords_for_program(target_program: str, family: str) -> bool:
    groups = {
        "skilled": ("express entry", "blue card", "skilled", "worker", "niw", "h-1b", "talent", "employment"),
        "investor": ("invest", "startup", "entrepreneur", "business", "golden visa", "founder"),
        "student": ("student", "study", "graduate", "education"),
        "family": ("spouse", "family", "dependent", "marriage", "partner", "reunification"),
    }
    return any(keyword in target_program for keyword in groups.get(family, ()))


def get_timeline_definition(
    *,
    target_country: str | None,
    target_program: str | None,
) -> TimelineDefinition:
    normalized_program = (target_program or "").strip().lower()
    normalized_country = (target_country or "").strip().lower()

    if keywords_for_program(normalized_program, "investor"):
        steps = INVESTOR_STEPS
        key = "investor"
    elif keywords_for_program(normalized_program, "student"):
        steps = STUDENT_STEPS
        key = "student"
    elif keywords_for_program(normalized_program, "family"):
        steps = FAMILY_STEPS
        key = "family"
    elif keywords_for_program(normalized_program, "skilled") or normalized_program:
        steps = SKILLED_STEPS
        key = "skilled"
    else:
        steps = GENERIC_STEPS
        key = "generic"

    if normalized_country in COUNTRY_REVIEW_ADJUSTMENTS:
        multiplier = COUNTRY_REVIEW_ADJUSTMENTS[normalized_country]
        adjusted_steps = []
        for step in steps:
            if step.phase == "review":
                adjusted_steps.append(
                    TimelineStepTemplate(
                        step_name=step.step_name,
                        base_duration_months=round_months(step.base_duration_months * multiplier),
                        description=step.description,
                        phase=step.phase,
                    )
                )
            else:
                adjusted_steps.append(step)
        return TimelineDefinition(key=f"{key}:{normalized_country}", steps=tuple(adjusted_steps))

    return TimelineDefinition(key=key, steps=steps)
