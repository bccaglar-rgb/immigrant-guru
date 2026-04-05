from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = ROOT / "packages" / "data" / "us_visa_kb"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SOURCE_VERSION = "us_official_seed_2026-04-04_v1"
LAST_VERIFIED_AT = "2026-04-04T00:00:00Z"

CONFIDENCE_POLICY = {
    "high": "Directly stated on a category-specific official U.S. government page or an official category page plus a directly applicable USCIS/State process page.",
    "medium": "Assembled conservatively from multiple official U.S. government pages without unsupported inference.",
    "low": "Incomplete, umbrella-level, or ambiguous; do not write to production catalog.",
}

VALIDATION_RULES = [
    "Every record must have at least one official source URL.",
    "Every record must have official_name, visa_code, and visa_family.",
    "If visa_bulletin_applicable is true, the record must be immigrant-family or immigrant-linked.",
    "If lottery_based is true, the record must include lottery notes.",
    "If treaty_nationality_required is true, the record must include a treaty nationality note.",
    "If sponsor_required is false and USCIS petition is not required, petition forms should usually be absent unless explicitly supported by an official source.",
    "If dual_intent is unknown, the field must be null.",
    "Subtype-specific rules must be stored in subtype_notes instead of being inferred into the base category.",
    "High-confidence production records must include at least one official source beyond the umbrella visa directory unless the directory page itself is the explicit official category page used for that category.",
]

PRODUCTION_MASTER_PROMPT = """You are a U.S. immigration data normalization engine working on a production immigration platform.

Use ONLY official U.S. government sources from:
- travel.state.gov
- uscis.gov
- dol.gov
- cbp.gov
- ice.gov
- eoir.justice.gov
- congress.gov

Never use blogs, law firm sites, forums, Reddit, Wikipedia, or commercial immigration sites.
Never guess.
Never infer missing rules from similar visa classes.
If a field is missing or ambiguous, set it to null and add a validation note.
Never overwrite an existing verified field with lower-confidence data.

Return one normalized visa record using the production schema.
Every record must include:
- visa_code
- official_name
- visa_family
- official_source_urls
- last_verified_at

Validation rules:
- If visa_bulletin_applicable is true, category must be immigrant or immigrant-linked.
- If lottery_based is true, include lottery notes.
- If treaty_nationality_required is true, include treaty nationality note.
- If sponsor_required is false and USCIS petition is not required, petition-form style entries should usually remain null unless explicitly supported by the source.
- If dual_intent is unknown, set null.
- Store subtype-specific limitations in subtype_notes.

Confidence policy:
- high: directly stated on a category-specific official page
- medium: assembled from multiple official pages
- low: incomplete or ambiguous; send to human review instead of production
"""

VALIDATOR_PROMPT = """You are a legal-data validator for a U.S. immigration platform.

Input:
- one structured visa JSON record

Task:
- verify internal consistency
- verify domain allowlist compliance
- verify required fields
- detect contradictions
- determine if record is safe for production

Return JSON:
- valid_for_production (true/false)
- confidence_level (high/medium/low)
- blocking_issues (list)
- warnings (list)
- normalized_fixes (list)
- requires_human_review (true/false)

Rules:
- Be conservative.
- If any legal ambiguity exists, require human review.
- Never invent missing values.
"""

VISA_BULLETIN_INGESTION_PROMPT = """You are a Visa Bulletin extraction engine.

Use ONLY:
- travel.state.gov Visa Bulletin pages
- uscis.gov adjustment-of-status filing chart pages

Extract:
- bulletin_month
- category_type (family / employment / diversity)
- visa_category
- chargeability_area
- chart_type (final_action / dates_for_filing)
- cutoff_date
- is_current
- is_unavailable
- source_url
- verified_at

Also extract:
- USCIS adjustment filing rule for the month:
  - family_chart_in_use
  - employment_chart_in_use

Rules:
- Keep Department of State bulletin data separate from USCIS chart-usage data.
- Do not merge them into one assumption.
- If the month is not found, return null.
"""

HUMAN_REVIEW_QUEUE_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "USVisaHumanReviewQueueRecord",
    "type": "object",
    "required": [
        "visa_code",
        "field_in_question",
        "issue_type",
        "source_urls",
        "codex_extracted_value",
        "reason",
        "recommended_action",
    ],
    "properties": {
        "visa_code": {"type": "string", "minLength": 1},
        "field_in_question": {"type": "string", "minLength": 1},
        "issue_type": {"type": "string", "minLength": 1},
        "source_urls": {
            "type": "array",
            "minItems": 1,
            "items": {"type": "string", "pattern": "^https://"},
        },
        "codex_extracted_value": {},
        "reason": {"type": "string", "minLength": 1},
        "recommended_action": {"type": "string", "minLength": 1},
    },
}

VISA_RECORD_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "USVisaCatalogRecord",
    "type": "object",
    "required": [
        "visa_code",
        "official_name",
        "visa_family",
        "official_source_urls",
        "last_verified_at",
        "confidence",
        "source_version",
    ],
    "properties": {
        "visa_code": {"type": "string", "minLength": 1},
        "visa_subtype": {"type": ["string", "null"]},
        "subtype": {"type": ["string", "null"]},
        "official_name": {"type": "string", "minLength": 1},
        "visa_family": {"type": "string", "enum": ["nonimmigrant", "immigrant"]},
        "category_group": {"type": ["string", "null"]},
        "jurisdiction": {"type": ["string", "null"]},
        "purpose": {"type": ["string", "null"]},
        "who_can_apply": {"type": "array", "items": {"type": "string"}},
        "petitioner_required": {"type": ["boolean", "null"]},
        "sponsor_required": {"type": ["boolean", "null"]},
        "petition_form": {"type": "array", "items": {"type": "string"}},
        "labor_certification_required": {"type": ["boolean", "null"]},
        "lca_required": {"type": ["boolean", "null"]},
        "uscis_petition_required": {"type": ["boolean", "null"]},
        "sevis_required": {"type": ["boolean", "null"]},
        "sevis_program_sponsorship_required": {"type": ["boolean", "null"]},
        "treaty_required": {"type": ["boolean", "null"]},
        "treaty_nationality_required": {"type": ["boolean", "null"]},
        "treaty_nationalities": {"type": "array", "items": {"type": "string"}},
        "treaty_nationality_note": {"type": ["string", "null"]},
        "derivative_visas": {"type": "array", "items": {"type": "string"}},
        "derivative_categories": {"type": "array", "items": {"type": "string"}},
        "work_authorization": {"type": ["boolean", "null"]},
        "work_authorized": {"type": ["boolean", "null"]},
        "study_authorization": {"type": ["boolean", "string", "null"]},
        "study_authorized": {"type": ["boolean", "string", "null"]},
        "dual_intent": {"type": ["boolean", "null"]},
        "cap_quota_status": {"type": ["string", "null"]},
        "numerical_cap": {"type": ["boolean", "null"]},
        "lottery_based": {"type": ["boolean", "null"]},
        "lottery_notes": {"type": ["string", "null"]},
        "visa_bulletin_applicable": {"type": ["boolean", "null"]},
        "aos_chart_behavior": {"type": ["string", "null"]},
        "adjustment_of_status_possible": {"type": ["boolean", "null"]},
        "consular_processing_possible": {"type": ["boolean", "null"]},
        "initial_validity": {"type": ["string", "null"]},
        "extension_renewal_basics": {"type": ["string", "null"]},
        "extension_rules": {"type": ["string", "null"]},
        "premium_processing_possible": {"type": ["boolean", "null"]},
        "core_eligibility_requirements": {"type": "array", "items": {"type": "string"}},
        "hard_disqualifiers": {"type": "array", "items": {"type": "string"}},
        "required_documents": {"type": "array", "items": {"type": "string"}},
        "common_denial_reasons": {"type": "array", "items": {"type": "string"}},
        "official_forms": {"type": "array", "items": {"type": "string"}},
        "official_source_urls": {
            "type": "array",
            "minItems": 1,
            "items": {"type": "string", "pattern": "^https://"},
        },
        "source_notes": {"type": "array", "items": {"type": "string"}},
        "last_verified_at": {"type": "string", "minLength": 1},
        "subtype_notes": {"type": ["string", "null"]},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "confidence_level": {"type": "string", "enum": ["high", "medium", "low"]},
        "confidence_basis": {"type": ["string", "null"]},
        "validation_notes": {"type": "array", "items": {"type": "string"}},
        "source_version": {"type": "string", "minLength": 1},
        "human_review_required": {"type": ["boolean", "null"]},
        "requires_human_review": {"type": ["boolean", "null"]},
    },
}

SOURCE_INDEX = {
    "directory_of_visa_categories": {
        "url": "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/all-visa-categories.html",
        "domain": "travel.state.gov",
        "label": "Directory of Visa Categories",
    },
    "visitor_visa": {
        "url": "https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html",
        "domain": "travel.state.gov",
        "label": "Visitor Visa",
    },
    "family_immigration": {
        "url": "https://travel.state.gov/content/travel/en/us-visas/immigrate/family-immigration.html",
        "domain": "travel.state.gov",
        "label": "Family Immigration",
    },
    "employment_based_immigrant_visas": {
        "url": "https://travel.state.gov/content/travel/en/us-visas/immigrate/employment-based-immigrant-visas.html",
        "domain": "travel.state.gov",
        "label": "Employment-Based Immigrant Visas",
    },
    "immigrant_investor_visas": {
        "url": "https://travel.state.gov/content/travel/en/us-visas/immigrate/immigrant-investor-visas.html",
        "domain": "travel.state.gov",
        "label": "Immigrant Investor Visas",
    },
    "diversity_visa_program": {
        "url": "https://travel.state.gov/content/travel/en/us-visas/immigrate/diversity-visa-program-entry/diversity-visa-submit-entry.html",
        "domain": "travel.state.gov",
        "label": "Diversity Visa Program",
    },
    "uscis_h1b": {
        "url": "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
        "domain": "uscis.gov",
        "label": "H-1B Specialty Occupations",
    },
    "uscis_l1a": {
        "url": "https://www.uscis.gov/working-in-the-united-states/temporary-workers/l-1a-intracompany-transferee-executive-or-manager",
        "domain": "uscis.gov",
        "label": "L-1A Intracompany Transferee Executive or Manager",
    },
    "uscis_tn": {
        "url": "https://www.uscis.gov/working-in-the-united-states/temporary-workers/tn-nafta-professionals",
        "domain": "uscis.gov",
        "label": "TN USMCA Professionals",
    },
    "uscis_aos_charts": {
        "url": "https://www.uscis.gov/green-card/green-card-processes-and-procedures/visa-availability-priority-dates/adjustment-of-status-filing-charts-from-the-visa-bulletin",
        "domain": "uscis.gov",
        "label": "Adjustment of Status Filing Charts from the Visa Bulletin",
    },
    "k3_state": {
        "url": "https://travel.state.gov/content/travel/en/us-visas/immigrate/family-immigration/nonimmigrant-visa-for-a-spouse-k-3.html",
        "domain": "travel.state.gov",
        "label": "Nonimmigrant Visa for a Spouse (K-3)",
    },
    "visa_bulletin_april_2026": {
        "url": "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/2026/visa-bulletin-for-april-2026.html",
        "domain": "travel.state.gov",
        "label": "Visa Bulletin for April 2026",
    },
}


def record(
    *,
    visa_code: str,
    official_name: str,
    visa_family: str,
    category_group: str | None = None,
    purpose: str,
    who_can_apply: list[str] | None = None,
    visa_subtype: str | None = None,
    petitioner_required: bool | None = None,
    sponsor_required: bool | None = None,
    petition_form: list[str] | None = None,
    labor_certification_required: bool | None = None,
    lca_required: bool | None = None,
    uscis_petition_required: bool | None = None,
    sevis_program_sponsorship_required: bool | None = None,
    sevis_required: bool | None = None,
    treaty_nationality_required: bool | None = None,
    treaty_required: bool | None = None,
    treaty_nationality_note: str | None = None,
    treaty_nationalities: list[str] | None = None,
    derivative_categories: list[str] | None = None,
    derivative_visas: list[str] | None = None,
    work_authorization: bool | None = None,
    study_authorization: bool | str | None = None,
    study_authorized: bool | str | None = None,
    dual_intent: bool | None = None,
    cap_quota_status: str | None = None,
    numerical_cap: bool | None = None,
    lottery_based: bool | None = None,
    lottery_notes: str | None = None,
    visa_bulletin_applicable: bool | None = None,
    aos_chart_behavior: str | None = None,
    adjustment_of_status_possible: bool | None = None,
    consular_processing_possible: bool | None = None,
    initial_validity: str | None = None,
    extension_renewal_basics: str | None = None,
    extension_rules: str | None = None,
    premium_processing_possible: bool | None = None,
    core_eligibility_requirements: list[str] | None = None,
    hard_disqualifiers: list[str] | None = None,
    required_documents: list[str] | None = None,
    common_denial_reasons: list[str] | None = None,
    official_forms: list[str] | None = None,
    official_source_keys: list[str] | None = None,
    source_notes: list[str] | None = None,
    subtype_notes: str | None = None,
    confidence: str = "medium",
    confidence_basis: str | None = None,
    validation_notes: list[str] | None = None,
) -> dict:
    official_source_urls = [
        SOURCE_INDEX[key]["url"] for key in (official_source_keys or [])
    ]
    resolved_study_authorization = (
        study_authorized
        if study_authorized is not None
        else study_authorization
    )
    resolved_sevis_required = (
        sevis_required
        if sevis_required is not None
        else sevis_program_sponsorship_required
    )
    resolved_treaty_required = (
        treaty_required
        if treaty_required is not None
        else treaty_nationality_required
    )
    resolved_derivative_visas = derivative_visas or derivative_categories or []
    resolved_petition_form = petition_form or []
    return {
        "visa_code": visa_code,
        "visa_subtype": visa_subtype,
        "subtype": visa_subtype,
        "official_name": official_name,
        "visa_family": visa_family,
        "category_group": category_group,
        "jurisdiction": "United States",
        "purpose": purpose,
        "who_can_apply": who_can_apply or [],
        "petitioner_required": petitioner_required,
        "sponsor_required": sponsor_required,
        "petition_form": resolved_petition_form,
        "labor_certification_required": labor_certification_required,
        "lca_required": lca_required,
        "uscis_petition_required": uscis_petition_required,
        "sevis_required": resolved_sevis_required,
        "sevis_program_sponsorship_required": sevis_program_sponsorship_required,
        "treaty_required": resolved_treaty_required,
        "treaty_nationality_required": treaty_nationality_required,
        "treaty_nationalities": treaty_nationalities or [],
        "treaty_nationality_note": treaty_nationality_note,
        "derivative_visas": resolved_derivative_visas,
        "derivative_categories": derivative_categories or [],
        "work_authorization": work_authorization,
        "work_authorized": work_authorization,
        "study_authorization": resolved_study_authorization,
        "study_authorized": resolved_study_authorization,
        "dual_intent": dual_intent,
        "cap_quota_status": cap_quota_status,
        "numerical_cap": numerical_cap,
        "lottery_based": lottery_based,
        "lottery_notes": lottery_notes,
        "visa_bulletin_applicable": visa_bulletin_applicable,
        "aos_chart_behavior": aos_chart_behavior,
        "adjustment_of_status_possible": adjustment_of_status_possible,
        "consular_processing_possible": consular_processing_possible,
        "initial_validity": initial_validity,
        "extension_renewal_basics": extension_renewal_basics,
        "extension_rules": extension_rules or extension_renewal_basics,
        "premium_processing_possible": premium_processing_possible,
        "core_eligibility_requirements": core_eligibility_requirements or [],
        "hard_disqualifiers": hard_disqualifiers or [],
        "required_documents": required_documents or [],
        "common_denial_reasons": common_denial_reasons or [],
        "official_forms": official_forms or [],
        "official_source_urls": official_source_urls,
        "source_notes": source_notes or [],
        "last_verified_at": LAST_VERIFIED_AT,
        "subtype_notes": subtype_notes,
        "confidence": confidence,
        "confidence_level": confidence,
        "confidence_basis": confidence_basis or CONFIDENCE_POLICY[confidence],
        "validation_notes": validation_notes or [],
        "source_version": SOURCE_VERSION,
        "requires_human_review": confidence == "low",
    }


HIGH_CONFIDENCE_RECORDS = [
    record(
        visa_code="B-1",
        official_name="Temporary Business Visitor",
        visa_family="nonimmigrant",
        purpose="Temporary business visits such as meetings, conferences, and consultations.",
        who_can_apply=["Foreign nationals seeking temporary business travel without U.S. employment."],
        petitioner_required=False,
        sponsor_required=False,
        uscis_petition_required=False,
        work_authorization=False,
        study_authorization=False,
        dual_intent=False,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Extensions or change of status may be requested if the temporary purpose remains valid.",
        core_eligibility_requirements=["Temporary intent", "Permissible B-1 activity", "Sufficient funds for the trip"],
        hard_disqualifiers=["Intent to engage in unauthorized employment"],
        required_documents=["Passport", "DS-160", "Purpose-of-trip evidence", "Financial evidence"],
        common_denial_reasons=["Insufficient temporary intent", "Unclear business purpose", "Suspected unauthorized work"],
        official_forms=["DS-160"],
        official_source_keys=["directory_of_visa_categories", "visitor_visa"],
        confidence="high",
    ),
    record(
        visa_code="B-2",
        official_name="Temporary Visitor for Tourism or Medical Treatment",
        visa_family="nonimmigrant",
        purpose="Tourism, social visits, and medical treatment.",
        who_can_apply=["Foreign nationals seeking temporary visitor admission for tourism or treatment."],
        petitioner_required=False,
        sponsor_required=False,
        uscis_petition_required=False,
        work_authorization=False,
        study_authorization=False,
        dual_intent=False,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Extensions or change of status may be requested if the temporary purpose remains valid.",
        core_eligibility_requirements=["Temporary intent", "Permissible B-2 activity", "Sufficient funds for the trip"],
        hard_disqualifiers=["Intent to work or study without proper classification"],
        required_documents=["Passport", "DS-160", "Travel itinerary or visit purpose evidence", "Financial evidence"],
        common_denial_reasons=["Insufficient ties abroad", "Suspected immigrant intent", "Insufficient financial credibility"],
        official_forms=["DS-160"],
        official_source_keys=["directory_of_visa_categories", "visitor_visa"],
        confidence="high",
    ),
    record(
        visa_code="B-1/B-2",
        official_name="Combined Business and Tourist Visitor",
        visa_family="nonimmigrant",
        purpose="Temporary business and tourism in a combined visitor classification.",
        petitioner_required=False,
        sponsor_required=False,
        uscis_petition_required=False,
        work_authorization=False,
        study_authorization=False,
        dual_intent=False,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Typically follows the same temporary-visit rules as B-1 or B-2.",
        core_eligibility_requirements=["Temporary intent", "Permissible B-1/B-2 uses"],
        hard_disqualifiers=["Unauthorized employment intent"],
        required_documents=["Passport", "DS-160", "Purpose-of-trip evidence"],
        common_denial_reasons=["Weak temporary intent", "Mixed-purpose trip not explained clearly"],
        official_forms=["DS-160"],
        official_source_keys=["directory_of_visa_categories", "visitor_visa"],
        confidence="high",
    ),
    record(
        visa_code="F-1",
        official_name="Academic Student",
        visa_family="nonimmigrant",
        purpose="Full-time academic study in the United States.",
        petitioner_required=False,
        sponsor_required=False,
        uscis_petition_required=False,
        sevis_program_sponsorship_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=False,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Status duration is tied to program rules and authorized practical training windows.",
        core_eligibility_requirements=["SEVP-certified school admission", "Form I-20", "Full-time study intent", "Financial support"],
        hard_disqualifiers=["Lack of school admission", "Insufficient funding", "Fraudulent academic purpose"],
        required_documents=["Passport", "DS-160", "Form I-20", "SEVIS fee receipt", "Financial evidence"],
        common_denial_reasons=["Weak student intent", "Funding gaps", "Poor credibility of academic plan"],
        official_forms=["DS-160", "I-20"],
        official_source_keys=["directory_of_visa_categories"],
        confidence="high",
    ),
    record(
        visa_code="M-1",
        official_name="Vocational Student",
        visa_family="nonimmigrant",
        purpose="Full-time vocational or nonacademic study in the United States.",
        petitioner_required=False,
        sponsor_required=False,
        uscis_petition_required=False,
        sevis_program_sponsorship_required=True,
        work_authorization=False,
        study_authorization=True,
        dual_intent=False,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Program-based stay with limited employment permissions compared with F-1.",
        core_eligibility_requirements=["Approved vocational program", "Form I-20", "Financial support"],
        hard_disqualifiers=["Insufficient funding", "Noncredible vocational purpose"],
        required_documents=["Passport", "DS-160", "Form I-20", "SEVIS fee receipt", "Financial evidence"],
        common_denial_reasons=["Weak student intent", "Funding gaps"],
        official_forms=["DS-160", "I-20"],
        official_source_keys=["directory_of_visa_categories"],
        confidence="high",
    ),
    record(
        visa_code="J-1",
        official_name="Exchange Visitor",
        visa_family="nonimmigrant",
        purpose="Approved exchange visitor programs such as research, au pair, teaching, or training.",
        petitioner_required=False,
        sponsor_required=True,
        uscis_petition_required=False,
        sevis_program_sponsorship_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=False,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Program duration depends on the designated exchange category and sponsor authorization.",
        core_eligibility_requirements=["Program sponsorship", "DS-2019", "Exchange purpose alignment"],
        hard_disqualifiers=["No designated sponsor", "Program mismatch", "212(e) restrictions where applicable"],
        required_documents=["Passport", "DS-160", "DS-2019", "SEVIS fee receipt", "Program support evidence"],
        common_denial_reasons=["Weak exchange-program fit", "Funding gaps", "Two-year home residency implications not resolved"],
        official_forms=["DS-160", "DS-2019"],
        official_source_keys=["directory_of_visa_categories"],
        subtype_notes="Certain J-1 subtypes can trigger INA 212(e) home residency requirements.",
        confidence="high",
    ),
    record(
        visa_code="H-1B",
        official_name="Specialty Occupation Worker",
        visa_family="nonimmigrant",
        category_group="employment",
        purpose="Specialty occupation employment in the United States.",
        who_can_apply=["Foreign nationals with a qualifying specialty occupation job offer."],
        petitioner_required=True,
        sponsor_required=True,
        petition_form=["I-129"],
        labor_certification_required=False,
        lca_required=True,
        uscis_petition_required=True,
        sevis_required=False,
        treaty_required=False,
        derivative_categories=["H-4"],
        derivative_visas=["H-4"],
        work_authorization=True,
        study_authorization="limited_or_incidental",
        dual_intent=True,
        cap_quota_status="cap_subject_for_many_cases",
        numerical_cap=True,
        lottery_based=True,
        lottery_notes="Cap-subject filings generally use a registration selection process before petition filing.",
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        initial_validity="See official source.",
        extension_renewal_basics="Commonly granted in fixed increments with a total stay framework tied to petition approval and extension rules.",
        extension_rules="See official source.",
        premium_processing_possible=True,
        core_eligibility_requirements=["Specialty occupation job offer", "Qualified beneficiary", "Approved Labor Condition Application", "USCIS petition approval"],
        hard_disqualifiers=["Job not accepted as specialty occupation", "Beneficiary does not meet qualification threshold", "Cap registration not selected where cap subject"],
        required_documents=["Passport", "Form I-129 support", "Degree evidence", "Job offer", "LCA copy", "Approval notice if applicable"],
        common_denial_reasons=["Job not specialty occupation", "Insufficient beneficiary qualifications", "Cap registration or selection not secured"],
        official_forms=["I-129", "DS-160"],
        official_source_keys=["directory_of_visa_categories", "uscis_h1b"],
        source_notes=["Cap and registration rules may vary by fiscal year."],
        confidence="high",
    ),
    record(
        visa_code="L-1A",
        official_name="Intracompany Transferee Executive or Manager",
        visa_family="nonimmigrant",
        purpose="Temporary transfer of a qualifying executive or manager to a U.S. office.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=False,
        dual_intent=True,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Initial stay varies by office type; extensions may continue up to the maximum L-1A limit.",
        core_eligibility_requirements=["Qualifying corporate relationship", "One year of qualifying employment abroad", "Executive or managerial role in the United States"],
        hard_disqualifiers=["No qualifying relationship", "Insufficient managerial or executive evidence"],
        required_documents=["Passport", "Form I-129 support", "Corporate relationship evidence", "Employment history evidence"],
        common_denial_reasons=["Insufficient manager/executive evidence", "Corporate relationship not established"],
        official_forms=["I-129", "DS-160"],
        official_source_keys=["directory_of_visa_categories", "uscis_l1a"],
        confidence="high",
    ),
    record(
        visa_code="L-1B",
        official_name="Intracompany Transferee Specialized Knowledge Worker",
        visa_family="nonimmigrant",
        purpose="Temporary transfer of an employee with specialized knowledge to a U.S. office.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=False,
        dual_intent=True,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Initial and extension periods are governed by L-1 rules and specialized-knowledge petition approval.",
        core_eligibility_requirements=["Qualifying corporate relationship", "One year of qualifying employment abroad", "Specialized knowledge role in the United States"],
        hard_disqualifiers=["No qualifying relationship", "Specialized knowledge not established"],
        required_documents=["Passport", "Form I-129 support", "Corporate relationship evidence", "Specialized knowledge evidence"],
        common_denial_reasons=["Insufficient specialized-knowledge evidence", "Corporate relationship not established"],
        official_forms=["I-129", "DS-160"],
        official_source_keys=["directory_of_visa_categories", "uscis_l1a"],
        subtype_notes="Uses the same L-1 framework but requires specialized-knowledge evidence rather than executive or managerial capacity.",
        confidence="medium",
    ),
    record(
        visa_code="O-1",
        official_name="Individual with Extraordinary Ability or Achievement",
        visa_family="nonimmigrant",
        purpose="Temporary work for individuals with extraordinary ability or achievement.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=False,
        dual_intent=None,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Extensions are tied to the events, activities, or work authorized by the petition.",
        core_eligibility_requirements=["Extraordinary ability or achievement evidence", "Petitioning U.S. employer or agent", "Advisory opinion where required"],
        hard_disqualifiers=["Evidence threshold not met"],
        required_documents=["Passport", "Form I-129 support", "Extraordinary ability evidence", "Petition approval"],
        common_denial_reasons=["Evidence threshold not met", "Insufficient advisory or support documentation"],
        official_forms=["I-129", "DS-160"],
        official_source_keys=["directory_of_visa_categories"],
        confidence="medium",
    ),
    record(
        visa_code="E-1",
        official_name="Treaty Trader",
        visa_family="nonimmigrant",
        purpose="Substantial trade under a qualifying treaty relationship.",
        petitioner_required=False,
        sponsor_required=False,
        uscis_petition_required=False,
        treaty_nationality_required=True,
        treaty_nationality_note="Only nationals of treaty countries qualify.",
        work_authorization=True,
        study_authorization=False,
        dual_intent=None,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Renewal is generally possible while treaty trader eligibility continues.",
        core_eligibility_requirements=["Treaty nationality", "Substantial qualifying trade", "Principal trade between treaty country and the United States"],
        hard_disqualifiers=["No treaty nationality", "Trade not substantial or qualifying"],
        required_documents=["Passport", "DS-160", "Trade evidence", "Ownership and nationality evidence"],
        common_denial_reasons=["Trade not substantial", "Treaty nationality not established"],
        official_forms=["DS-160"],
        official_source_keys=["directory_of_visa_categories"],
        confidence="medium",
    ),
    record(
        visa_code="E-2",
        official_name="Treaty Investor",
        visa_family="nonimmigrant",
        purpose="Direct and develop a qualifying enterprise after a substantial treaty investment.",
        petitioner_required=False,
        sponsor_required=False,
        uscis_petition_required=False,
        treaty_nationality_required=True,
        treaty_nationality_note="Only nationals of treaty countries qualify.",
        work_authorization=True,
        study_authorization=False,
        dual_intent=None,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Renewal is generally possible while treaty investor eligibility continues.",
        core_eligibility_requirements=["Treaty nationality", "Substantial investment", "Real and operating enterprise", "Intent to direct and develop the business"],
        hard_disqualifiers=["No treaty nationality", "Investment not substantial", "Marginal or non-operating enterprise"],
        required_documents=["Passport", "DS-160", "Investment evidence", "Business ownership evidence", "Business plan or operating evidence"],
        common_denial_reasons=["Investment not substantial", "Treaty nationality not established", "Enterprise not credible"],
        official_forms=["DS-160"],
        official_source_keys=["directory_of_visa_categories"],
        confidence="high",
    ),
    record(
        visa_code="E-3",
        official_name="Australian Specialty Occupation Worker",
        visa_family="nonimmigrant",
        purpose="Specialty occupation employment for qualifying Australian nationals.",
        petitioner_required=False,
        sponsor_required=True,
        uscis_petition_required=False,
        treaty_nationality_required=True,
        treaty_nationality_note="Available only to Australian nationals.",
        work_authorization=True,
        study_authorization=False,
        dual_intent=None,
        cap_quota_status="annual_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Renewals depend on continuing specialty occupation eligibility.",
        core_eligibility_requirements=["Australian nationality", "Specialty occupation position", "Qualified beneficiary", "Valid labor condition process where required"],
        hard_disqualifiers=["Not an Australian national", "Position not accepted as specialty occupation"],
        required_documents=["Passport", "DS-160", "Job offer", "Degree evidence", "LCA or equivalent labor evidence"],
        common_denial_reasons=["Nationality requirement not met", "Position not specialty occupation"],
        official_forms=["DS-160"],
        official_source_keys=["directory_of_visa_categories"],
        confidence="medium",
    ),
    record(
        visa_code="TN",
        official_name="USMCA Professional",
        visa_family="nonimmigrant",
        purpose="Temporary professional employment for qualified Canadian and Mexican professionals under the USMCA.",
        petitioner_required=False,
        sponsor_required=True,
        uscis_petition_required=False,
        treaty_nationality_required=True,
        treaty_nationality_note="Available only to citizens of Canada or Mexico in qualifying professions.",
        work_authorization=True,
        study_authorization=False,
        dual_intent=False,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Renewal depends on continuing temporary professional eligibility.",
        core_eligibility_requirements=["Canadian or Mexican citizenship", "Qualifying profession", "Supporting employer letter", "Required credentials"],
        hard_disqualifiers=["Not a Canadian or Mexican citizen", "Profession not on USMCA list"],
        required_documents=["Passport", "Employer support letter", "Degree or license evidence", "DS-160 where consular processing applies"],
        common_denial_reasons=["Profession not qualifying", "Credentials insufficient", "Temporary intent not established"],
        official_forms=["I-129", "DS-160"],
        official_source_keys=["directory_of_visa_categories", "uscis_tn"],
        confidence="high",
    ),
    record(
        visa_code="K-1",
        official_name="Fiancé(e) of a U.S. Citizen",
        visa_family="nonimmigrant",
        purpose="Entry for a foreign-citizen fiancé(e) to marry a U.S. citizen and proceed under the K framework.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=False,
        dual_intent=None,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="K-1 is a narrowly purpose-bound entry classification rather than a general renewable temporary category.",
        core_eligibility_requirements=["Qualifying U.S. citizen petitioner", "Valid fiancé(e) relationship under official rules", "USCIS petition process"],
        hard_disqualifiers=["Petitioner eligibility not established", "Relationship requirements not established"],
        required_documents=["Passport", "DS-160", "Approved petition evidence", "Civil documents"],
        common_denial_reasons=["Relationship evidence insufficient", "Petition defects"],
        official_forms=["I-129F", "DS-160"],
        official_source_keys=["directory_of_visa_categories"],
        confidence="medium",
    ),
    record(
        visa_code="K-3",
        official_name="Nonimmigrant Visa for a Spouse of a U.S. Citizen",
        visa_family="nonimmigrant",
        purpose="Spousal entry under the K-3 framework while immigrant processing remains pending where applicable.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=False,
        dual_intent=None,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="K-3 processing depends on the underlying spousal petition framework.",
        core_eligibility_requirements=["Qualifying U.S. citizen spouse", "Underlying petition framework", "Consular processing requirements"],
        hard_disqualifiers=["Spousal petition defects", "Relationship ineligibility"],
        required_documents=["Passport", "DS-160", "Petition evidence", "Civil documents"],
        common_denial_reasons=["Petition framework not properly established", "Insufficient relationship documentation"],
        official_forms=["I-130", "I-129F", "DS-160"],
        official_source_keys=["directory_of_visa_categories", "k3_state"],
        confidence="high",
    ),
    record(
        visa_code="IR1/CR1",
        official_name="Immediate Relative / Conditional Resident Spouse of a U.S. Citizen",
        visa_family="immigrant",
        purpose="Immigrant visa pathway for a U.S. citizen’s spouse.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="not_numerically_limited",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Immigrant visa path; CR vs IR treatment depends on marriage-duration conditions.",
        core_eligibility_requirements=["Qualifying U.S. citizen spouse petition", "Valid marital relationship", "Admissibility and documentary eligibility"],
        hard_disqualifiers=["Relationship not valid under immigration rules", "Inadmissibility grounds not waived or resolved"],
        required_documents=["Passport", "I-130 evidence", "Civil documents", "Financial sponsorship evidence", "DS-260"],
        common_denial_reasons=["Relationship credibility issues", "Inadmissibility", "Documentary insufficiency"],
        official_forms=["I-130", "DS-260"],
        official_source_keys=["family_immigration"],
        confidence="high",
    ),
    record(
        visa_code="IR2/CR2",
        official_name="Immediate Relative / Conditional Resident Child of a U.S. Citizen",
        visa_family="immigrant",
        purpose="Immigrant visa pathway for a qualifying child of a U.S. citizen.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="not_numerically_limited",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Immigrant visa path; conditional treatment depends on category facts and petition structure.",
        core_eligibility_requirements=["Qualifying U.S. citizen parent petition", "Child relationship requirements", "Admissibility and documentary eligibility"],
        hard_disqualifiers=["Relationship or age definition not met", "Inadmissibility grounds not resolved"],
        required_documents=["Passport", "I-130 evidence", "Civil documents", "DS-260"],
        common_denial_reasons=["Relationship evidence insufficient", "Age/status definition issues", "Documentary insufficiency"],
        official_forms=["I-130", "DS-260"],
        official_source_keys=["family_immigration"],
        confidence="high",
    ),
    record(
        visa_code="IR5",
        official_name="Parent of a U.S. Citizen",
        visa_family="immigrant",
        purpose="Immigrant visa pathway for a qualifying parent of a U.S. citizen.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="not_numerically_limited",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Immigrant visa path with immediate-relative treatment where statutory requirements are met.",
        core_eligibility_requirements=["Qualifying U.S. citizen petitioner", "Parent relationship", "Admissibility and documentary eligibility"],
        hard_disqualifiers=["Relationship requirement not met", "Inadmissibility grounds unresolved"],
        required_documents=["Passport", "I-130 evidence", "Civil documents", "DS-260"],
        common_denial_reasons=["Relationship evidence insufficient", "Documentary insufficiency", "Inadmissibility"],
        official_forms=["I-130", "DS-260"],
        official_source_keys=["family_immigration"],
        confidence="high",
    ),
    record(
        visa_code="F1",
        official_name="Unmarried Sons and Daughters of U.S. Citizens",
        visa_family="immigrant",
        purpose="Family-sponsored preference immigrant category for qualifying unmarried sons and daughters of U.S. citizens.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Preference-category timing depends on priority date and monthly availability.",
        core_eligibility_requirements=["Qualifying U.S. citizen petitioner", "Preference-category relationship requirements", "Current priority date when required"],
        hard_disqualifiers=["Relationship definition not met", "Priority date not current for final processing"],
        required_documents=["Passport", "I-130 evidence", "Civil documents", "Financial sponsorship evidence", "DS-260"],
        common_denial_reasons=["Priority date not current", "Relationship evidence insufficient", "Inadmissibility"],
        official_forms=["I-130", "DS-260", "I-485"],
        official_source_keys=["family_immigration", "uscis_aos_charts", "visa_bulletin_april_2026"],
        confidence="high",
    ),
    record(
        visa_code="F2A",
        official_name="Spouses and Children of Permanent Residents",
        visa_family="immigrant",
        purpose="Family-sponsored preference immigrant category for spouses and qualifying children of permanent residents.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Preference-category timing depends on priority date and monthly availability.",
        core_eligibility_requirements=["Qualifying lawful permanent resident petitioner", "Preference-category relationship requirements", "Current priority date when required"],
        hard_disqualifiers=["Relationship definition not met", "Priority date not current for final processing"],
        required_documents=["Passport", "I-130 evidence", "Civil documents", "Financial sponsorship evidence", "DS-260"],
        common_denial_reasons=["Priority date not current", "Relationship evidence insufficient", "Inadmissibility"],
        official_forms=["I-130", "DS-260", "I-485"],
        official_source_keys=["family_immigration", "uscis_aos_charts", "visa_bulletin_april_2026"],
        confidence="high",
    ),
    record(
        visa_code="F2B",
        official_name="Unmarried Sons and Daughters (21 and over) of Permanent Residents",
        visa_family="immigrant",
        purpose="Family-sponsored preference immigrant category for qualifying adult unmarried sons and daughters of permanent residents.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Preference-category timing depends on priority date and monthly availability.",
        core_eligibility_requirements=["Qualifying lawful permanent resident petitioner", "Preference-category relationship requirements", "Current priority date when required"],
        hard_disqualifiers=["Relationship definition not met", "Priority date not current for final processing"],
        required_documents=["Passport", "I-130 evidence", "Civil documents", "Financial sponsorship evidence", "DS-260"],
        common_denial_reasons=["Priority date not current", "Relationship evidence insufficient", "Inadmissibility"],
        official_forms=["I-130", "DS-260", "I-485"],
        official_source_keys=["family_immigration", "uscis_aos_charts", "visa_bulletin_april_2026"],
        confidence="high",
    ),
    record(
        visa_code="F3",
        official_name="Married Sons and Daughters of U.S. Citizens",
        visa_family="immigrant",
        purpose="Family-sponsored preference immigrant category for qualifying married sons and daughters of U.S. citizens.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Preference-category timing depends on priority date and monthly availability.",
        core_eligibility_requirements=["Qualifying U.S. citizen petitioner", "Preference-category relationship requirements", "Current priority date when required"],
        hard_disqualifiers=["Relationship definition not met", "Priority date not current for final processing"],
        required_documents=["Passport", "I-130 evidence", "Civil documents", "Financial sponsorship evidence", "DS-260"],
        common_denial_reasons=["Priority date not current", "Relationship evidence insufficient", "Inadmissibility"],
        official_forms=["I-130", "DS-260", "I-485"],
        official_source_keys=["family_immigration", "uscis_aos_charts", "visa_bulletin_april_2026"],
        confidence="high",
    ),
    record(
        visa_code="F4",
        official_name="Brothers and Sisters of Adult U.S. Citizens",
        visa_family="immigrant",
        purpose="Family-sponsored preference immigrant category for qualifying siblings of adult U.S. citizens.",
        petitioner_required=True,
        sponsor_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Preference-category timing depends on priority date and monthly availability.",
        core_eligibility_requirements=["Qualifying U.S. citizen petitioner", "Preference-category sibling relationship requirements", "Current priority date when required"],
        hard_disqualifiers=["Relationship definition not met", "Priority date not current for final processing"],
        required_documents=["Passport", "I-130 evidence", "Civil documents", "Financial sponsorship evidence", "DS-260"],
        common_denial_reasons=["Priority date not current", "Relationship evidence insufficient", "Inadmissibility"],
        official_forms=["I-130", "DS-260", "I-485"],
        official_source_keys=["family_immigration", "uscis_aos_charts", "visa_bulletin_april_2026"],
        confidence="high",
    ),
    record(
        visa_code="EB-1",
        official_name="Priority Workers",
        visa_family="immigrant",
        purpose="Employment-based first preference immigrant category for qualifying priority workers.",
        petitioner_required=True,
        sponsor_required=True,
        labor_certification_required=False,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Immigrant classification based on approved petition and current visa availability where required.",
        core_eligibility_requirements=["Qualifying EB-1 subcategory", "Approved I-140 petition unless exempt by category rule", "Current visa availability where required"],
        hard_disqualifiers=["Subcategory evidence not established", "Visa number not available where required"],
        required_documents=["Passport", "I-140 evidence", "Civil documents", "DS-260 or I-485 support"],
        common_denial_reasons=["Extraordinary ability or multinational criteria not met", "Insufficient petition evidence"],
        official_forms=["I-140", "DS-260", "I-485"],
        official_source_keys=["employment_based_immigrant_visas", "uscis_aos_charts", "visa_bulletin_april_2026"],
        confidence="high",
    ),
    record(
        visa_code="EB-2",
        official_name="Advanced Degree or Exceptional Ability",
        visa_family="immigrant",
        purpose="Employment-based second preference immigrant category for advanced-degree or exceptional-ability workers.",
        petitioner_required=True,
        sponsor_required=True,
        labor_certification_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Immigrant classification based on approved petition, labor certification where required, and current visa availability.",
        core_eligibility_requirements=["Advanced degree or exceptional ability", "Approved I-140", "Labor certification unless exempt", "Current visa availability where required"],
        hard_disqualifiers=["Qualification threshold not met", "Labor certification or petition not approved", "Visa number not available where required"],
        required_documents=["Passport", "I-140 evidence", "PERM evidence where required", "Civil documents", "DS-260 or I-485 support"],
        common_denial_reasons=["Qualification evidence insufficient", "Labor certification defects", "Petition evidence weak"],
        official_forms=["I-140", "ETA-9089", "DS-260", "I-485"],
        official_source_keys=["employment_based_immigrant_visas", "uscis_aos_charts", "visa_bulletin_april_2026"],
        confidence="high",
    ),
    record(
        visa_code="EB-2 NIW",
        official_name="National Interest Waiver",
        visa_family="immigrant",
        purpose="Employment-based second preference pathway with a national-interest waiver framework.",
        petitioner_required=False,
        sponsor_required=False,
        labor_certification_required=False,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Immigrant classification based on approved petition and current visa availability.",
        core_eligibility_requirements=["EB-2 threshold", "National interest waiver framework met", "Approved I-140", "Current visa availability where required"],
        hard_disqualifiers=["National-interest framework not established", "Petition evidence insufficient", "Visa number not available where required"],
        required_documents=["Passport", "I-140 evidence", "National interest evidence", "Civil documents", "DS-260 or I-485 support"],
        common_denial_reasons=["National interest showing not persuasive", "Qualification evidence insufficient"],
        official_forms=["I-140", "DS-260", "I-485"],
        official_source_keys=["employment_based_immigrant_visas", "uscis_aos_charts", "visa_bulletin_april_2026"],
        subtype_notes="Stored separately because NIW changes labor certification and sponsor assumptions compared with standard EB-2.",
        confidence="high",
    ),
    record(
        visa_code="EB-3",
        official_name="Skilled Workers, Professionals, and Other Workers",
        visa_family="immigrant",
        purpose="Employment-based third preference immigrant category for qualifying skilled workers, professionals, and other workers.",
        petitioner_required=True,
        sponsor_required=True,
        labor_certification_required=True,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Immigrant classification based on approved petition, labor certification, and current visa availability.",
        core_eligibility_requirements=["Qualifying EB-3 subcategory", "Approved I-140", "Labor certification where required", "Current visa availability where required"],
        hard_disqualifiers=["Qualification threshold not met", "Labor certification or petition not approved", "Visa number not available where required"],
        required_documents=["Passport", "I-140 evidence", "PERM evidence", "Civil documents", "DS-260 or I-485 support"],
        common_denial_reasons=["Qualification evidence insufficient", "Labor certification defects", "Petition evidence weak"],
        official_forms=["I-140", "ETA-9089", "DS-260", "I-485"],
        official_source_keys=["employment_based_immigrant_visas", "uscis_aos_charts", "visa_bulletin_april_2026"],
        confidence="high",
    ),
    record(
        visa_code="EB-4",
        official_name="Certain Special Immigrants",
        visa_family="immigrant",
        purpose="Employment-based fourth preference immigrant category for qualifying special immigrants.",
        petitioner_required=True,
        sponsor_required=True,
        labor_certification_required=False,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Immigrant classification based on approved petition, subcategory-specific rules, and current visa availability.",
        core_eligibility_requirements=["Qualifying EB-4 special immigrant subcategory", "Approved petition where required", "Current visa availability where required"],
        hard_disqualifiers=["Subcategory eligibility not established", "Visa number not available where required"],
        required_documents=["Passport", "Petition evidence", "Civil documents", "DS-260 or I-485 support"],
        common_denial_reasons=["Special immigrant eligibility not established", "Documentary insufficiency"],
        official_forms=["I-360", "DS-260", "I-485"],
        official_source_keys=["employment_based_immigrant_visas", "uscis_aos_charts", "visa_bulletin_april_2026"],
        confidence="high",
    ),
    record(
        visa_code="EB-5",
        official_name="Immigrant Investor",
        visa_family="immigrant",
        purpose="Employment-based fifth preference immigrant category for qualifying investors creating U.S. jobs and capital investment.",
        petitioner_required=False,
        sponsor_required=False,
        labor_certification_required=False,
        uscis_petition_required=True,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="preference_numerical_limit_with_set_asides",
        lottery_based=False,
        visa_bulletin_applicable=True,
        aos_chart_behavior="USCIS designates whether Final Action Dates or Dates for Filing charts apply for AOS each month.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="Immigrant classification depends on the investor petition framework and current visa availability.",
        core_eligibility_requirements=["Qualifying capital investment", "Job creation framework", "Approved petition", "Current visa availability where required"],
        hard_disqualifiers=["Investment threshold not met", "Job creation framework not met", "Visa number not available where required"],
        required_documents=["Passport", "Investor petition evidence", "Source-of-funds evidence", "Civil documents", "DS-260 or I-485 support"],
        common_denial_reasons=["Source of funds not established", "Investment or job-creation evidence insufficient"],
        official_forms=["I-526", "DS-260", "I-485"],
        official_source_keys=["employment_based_immigrant_visas", "immigrant_investor_visas", "uscis_aos_charts", "visa_bulletin_april_2026"],
        confidence="high",
    ),
    record(
        visa_code="DV",
        official_name="Diversity Immigrant Visa",
        visa_family="immigrant",
        purpose="Diversity immigrant visa program selected by random entry process under official annual instructions.",
        petitioner_required=False,
        sponsor_required=False,
        uscis_petition_required=False,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="annual_program_limit",
        lottery_based=True,
        lottery_notes="Selection occurs through the official annual DV entry process.",
        visa_bulletin_applicable=True,
        aos_chart_behavior="DV numbers and regional cutoffs are reflected through the Visa Bulletin and fiscal-year timing rules.",
        adjustment_of_status_possible=True,
        consular_processing_possible=True,
        extension_renewal_basics="DV eligibility is bounded by the relevant fiscal-year program deadline.",
        core_eligibility_requirements=["Qualifying country or chargeability eligibility", "Education or work-experience threshold", "Selection through official DV process"],
        hard_disqualifiers=["Not selected", "Program-year deadline missed", "Country eligibility not met"],
        required_documents=["Passport", "DV selection evidence", "Civil documents", "DS-260 or I-485 support"],
        common_denial_reasons=["Selection or rank not current", "Eligibility threshold not met", "Fiscal-year deadline passed"],
        official_forms=["DS-260", "I-485"],
        official_source_keys=["diversity_visa_program", "visa_bulletin_april_2026", "uscis_aos_charts"],
        confidence="high",
    ),
    record(
        visa_code="SB-1",
        official_name="Returning Resident",
        visa_family="immigrant",
        purpose="Returning resident classification for certain lawful permanent residents seeking reentry after an extended absence.",
        petitioner_required=False,
        sponsor_required=False,
        uscis_petition_required=False,
        work_authorization=True,
        study_authorization=True,
        dual_intent=None,
        cap_quota_status="none",
        lottery_based=False,
        visa_bulletin_applicable=False,
        adjustment_of_status_possible=False,
        consular_processing_possible=True,
        extension_renewal_basics="Consular returning-resident framework rather than a standard renewable visa category.",
        core_eligibility_requirements=["Prior LPR status", "Qualifying returning resident criteria", "Consular documentation"],
        hard_disqualifiers=["Returning-resident criteria not met"],
        required_documents=["Passport", "Returning resident application evidence", "Prior residence evidence"],
        common_denial_reasons=["Unable to establish returning resident eligibility"],
        official_forms=["DS-117", "DS-260"],
        official_source_keys=["directory_of_visa_categories"],
        confidence="medium",
    ),
]


LOW_CONFIDENCE_REVIEW_RECORDS = [
    record(visa_code="A", official_name="Diplomatic and Foreign Government Officials", visa_family="nonimmigrant", purpose="Official diplomatic or government travel.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Requires subtype-specific diplomatic handling review."]),
    record(visa_code="C", official_name="Transit", visa_family="nonimmigrant", purpose="Immediate and continuous transit through the United States.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Transit subtype handling needs deeper rule extraction."]),
    record(visa_code="D", official_name="Crewmember", visa_family="nonimmigrant", purpose="Crewmember service on sea vessel or international airline.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Crew-specific work and shore-leave rules need deeper extraction."]),
    record(visa_code="G", official_name="International Organization Representative", visa_family="nonimmigrant", purpose="Travel for designated international organizations.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Subtype-specific organization eligibility needs review."]),
    record(visa_code="I", official_name="Foreign Media Representative", visa_family="nonimmigrant", purpose="Media-related travel and assignments.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Media activity boundaries need category-specific extraction."]),
    record(visa_code="NATO", official_name="NATO Staff", visa_family="nonimmigrant", purpose="Travel for qualifying NATO assignments.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Subtype-specific NATO classes need normalization."]),
    record(visa_code="H-1B1", official_name="Specialty Occupation Worker from Chile/Singapore", visa_family="nonimmigrant", purpose="Specialty occupation work under country-specific H-1B1 rules.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Needs country-specific official extraction and labor handling details."]),
    record(visa_code="H-2A", official_name="Temporary Agricultural Worker", visa_family="nonimmigrant", purpose="Temporary or seasonal agricultural work.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["DOL and petition workflow should be extracted from category-specific official pages."]),
    record(visa_code="H-2B", official_name="Temporary Nonagricultural Worker", visa_family="nonimmigrant", purpose="Temporary or seasonal nonagricultural work.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["DOL and petition workflow should be extracted from category-specific official pages."]),
    record(visa_code="H-3", official_name="Trainee or Special Education Exchange Visitor", visa_family="nonimmigrant", purpose="Training or special education exchange under H-3 rules.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Subtype-specific trainee restrictions need extraction."]),
    record(visa_code="O-2", official_name="Support Personnel for O-1", visa_family="nonimmigrant", purpose="Essential support personnel accompanying O-1 beneficiaries.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Dependent support role criteria need extraction."]),
    record(visa_code="P-1", official_name="Athlete or Entertainment Group Member", visa_family="nonimmigrant", purpose="Performance or competition under P-1 rules.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Subtypes P-1A/P-1B should be separated after official extraction."]),
    record(visa_code="P-2", official_name="Artist or Entertainer in Reciprocal Exchange Program", visa_family="nonimmigrant", purpose="Performance under reciprocal exchange program rules.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Program-specific documentation needs extraction."]),
    record(visa_code="P-3", official_name="Culturally Unique Artist or Entertainer", visa_family="nonimmigrant", purpose="Performance or teaching under culturally unique program rules.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Culturally unique evidence threshold needs extraction."]),
    record(visa_code="Q-1", official_name="International Cultural Exchange Visitor", visa_family="nonimmigrant", purpose="Practical training and cultural exchange.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Program sponsorship and duration details need extraction."]),
    record(visa_code="R-1", official_name="Temporary Religious Worker", visa_family="nonimmigrant", purpose="Temporary religious work.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Category-specific petition and evidentiary rules need extraction."]),
    record(visa_code="T", official_name="Victim of Human Trafficking", visa_family="nonimmigrant", purpose="Protection-related status for qualifying trafficking victims.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Victim certification and waiver details need extraction."]),
    record(visa_code="U", official_name="Victim of Criminal Activity", visa_family="nonimmigrant", purpose="Protection-related status for qualifying crime victims.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Law-enforcement certification and cap handling need extraction."]),
    record(visa_code="V", official_name="Spouse or Child of a Lawful Permanent Resident", visa_family="nonimmigrant", purpose="Legacy family-related nonimmigrant classification.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Eligibility is legacy/limited and needs precise statutory extraction."]),
    record(visa_code="CW-1", official_name="CNMI Transitional Worker", visa_family="nonimmigrant", purpose="Temporary worker classification for the Commonwealth of the Northern Mariana Islands.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["CNMI-specific statutory limitations need extraction."]),
    record(visa_code="BCC", official_name="Border Crossing Card", visa_family="nonimmigrant", purpose="Border crossing and visitor use for qualifying Mexican nationals.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Use restrictions and derivative handling need extraction."]),
    record(visa_code="S", official_name="Witness or Informant", visa_family="nonimmigrant", purpose="Law-enforcement-related witness or informant classification.", official_source_keys=["directory_of_visa_categories"], confidence="low", validation_notes=["Sensitive category; official extraction should be handled manually."]),
    record(visa_code="TD", official_name="Dependent of TN", visa_family="nonimmigrant", purpose="Dependent classification for qualifying family members of TN principals.", official_source_keys=["directory_of_visa_categories", "uscis_tn"], confidence="low", validation_notes=["Dependent work/study rules should be confirmed from official category-specific pages."]),
    record(visa_code="SIV", official_name="Special Immigrant Visa Classes", visa_family="immigrant", purpose="Special immigrant pathways including certain protected classes.", official_source_keys=["family_immigration", "employment_based_immigrant_visas"], confidence="low", validation_notes=["Needs subtype-level separation for Iraqi/Afghan and other special immigrant classes."]),
]


def validate(record_data: dict) -> list[str]:
    errors: list[str] = []
    if not record_data["official_source_urls"]:
        errors.append("missing_official_source_urls")
    if not record_data["official_name"]:
        errors.append("missing_official_name")
    if not record_data["visa_code"]:
        errors.append("missing_visa_code")
    if record_data["visa_family"] not in {"nonimmigrant", "immigrant"}:
        errors.append("invalid_visa_family")
    if record_data["visa_bulletin_applicable"] is True and record_data["visa_family"] != "immigrant":
        errors.append("visa_bulletin_nonimmigrant_mismatch")
    if record_data["lottery_based"] is True and not record_data["lottery_notes"]:
        errors.append("lottery_notes_required")
    if record_data["treaty_nationality_required"] is True and not record_data["treaty_nationality_note"]:
        errors.append("treaty_note_required")
    if (
        record_data["sponsor_required"] is False
        and record_data["uscis_petition_required"] is False
        and any(form.startswith("I-") for form in record_data["official_forms"])
    ):
        errors.append("petition_form_without_sponsor")
    if (
        record_data["confidence"] == "high"
        and all(
            source == SOURCE_INDEX["directory_of_visa_categories"]["url"]
            for source in record_data["official_source_urls"]
        )
    ):
        errors.append("high_confidence_requires_category_specific_source")
    return errors


def main() -> None:
    discovered = deepcopy(HIGH_CONFIDENCE_RECORDS) + deepcopy(LOW_CONFIDENCE_REVIEW_RECORDS)
    catalog: list[dict] = []
    review_queue: list[dict] = []
    validation_results: list[dict] = []
    review_queue_records: list[dict] = []

    for item in discovered:
        errors = validate(item)
        status = "passed"
        if item["confidence"] == "low":
            status = "human_review"
        if errors:
            status = "human_review"
            item["validation_notes"] = sorted(set(item["validation_notes"] + errors))

        validation_results.append(
            {
                "visa_code": item["visa_code"],
                "confidence": item["confidence"],
                "status": status,
                "errors": errors,
                "validation_notes": item["validation_notes"],
            }
        )

        if status == "passed":
            catalog.append(item)
        else:
            item["human_review_required"] = True
            review_queue.append(item)
            review_queue_records.append(
                {
                    "visa_code": item["visa_code"],
                    "field_in_question": (
                        item["validation_notes"][0]
                        if item["validation_notes"]
                        else "record_review"
                    ),
                    "issue_type": "ambiguous_or_subtype_specific"
                    if item["confidence"] == "low"
                    else "validation_failure",
                    "source_urls": item["official_source_urls"],
                    "codex_extracted_value": None,
                    "reason": "; ".join(item["validation_notes"])
                    if item["validation_notes"]
                    else "Record requires manual legal review.",
                    "recommended_action": "Manual legal review before publish",
                }
            )

    validation_report = {
        "source_version": SOURCE_VERSION,
        "generated_at": LAST_VERIFIED_AT,
        "discovered_records": len(discovered),
        "catalog_records": len(catalog),
        "human_review_records": len(review_queue),
        "passed_records": len([r for r in validation_results if r["status"] == "passed"]),
        "results": validation_results,
    }

    (OUTPUT_DIR / "source_index.json").write_text(
        json.dumps(
            {
                "source_version": SOURCE_VERSION,
                "generated_at": LAST_VERIFIED_AT,
                "allowed_domains": [
                    "travel.state.gov",
                    "uscis.gov",
                    "dol.gov",
                    "cbp.gov",
                    "ice.gov",
                    "eoir.justice.gov",
                    "congress.gov",
                ],
                "confidence_policy": CONFIDENCE_POLICY,
                "validation_rules": VALIDATION_RULES,
                "sources": SOURCE_INDEX,
            },
            indent=2,
            ensure_ascii=True,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "visa_catalog.json").write_text(
        json.dumps(catalog, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "validation_report.json").write_text(
        json.dumps(validation_report, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "human_review_queue.json").write_text(
        json.dumps(review_queue_records, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "visa_record.schema.json").write_text(
        json.dumps(VISA_RECORD_SCHEMA, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "validation_checklist.json").write_text(
        json.dumps(
            {
                "source_version": SOURCE_VERSION,
                "generated_at": LAST_VERIFIED_AT,
                "confidence_policy": CONFIDENCE_POLICY,
                "validation_rules": VALIDATION_RULES,
                "persistence_policy": {
                    "upsert_key": ["visa_code", "subtype", "source_version"],
                    "production_write_threshold": "high_or_medium_with_validation_pass",
                    "low_confidence_destination": "human_review_queue",
                    "verified_record_protection": "never overwrite a verified field with lower-confidence data",
                    "bulletin_data_policy": "archive bulletin-driven data separately rather than replacing historical records",
                },
            },
            indent=2,
            ensure_ascii=True,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "codex_master_prompt.txt").write_text(
        PRODUCTION_MASTER_PROMPT + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "codex_validator_prompt.txt").write_text(
        VALIDATOR_PROMPT + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "codex_visa_bulletin_ingestion_prompt.txt").write_text(
        VISA_BULLETIN_INGESTION_PROMPT + "\n",
        encoding="utf-8",
    )
    (OUTPUT_DIR / "human_review_queue.schema.json").write_text(
        json.dumps(HUMAN_REVIEW_QUEUE_SCHEMA, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
