from __future__ import annotations

from dataclasses import dataclass

from app.models.document import Document
from app.models.enums import DocumentUploadStatus, MaritalStatus
from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.workspace import (
    ChecklistItemStatus,
    ChecklistRequirementLevel,
    DocumentChecklistItemRead,
    DocumentChecklistSummaryRead,
)
from app.services.ai.scoring_helpers import is_present, round_score


@dataclass(frozen=True)
class ChecklistTemplate:
    slug: str
    document_name: str
    category: str
    requirement_level: ChecklistRequirementLevel
    notes: str
    aliases: tuple[str, ...]


class DocumentChecklistService:
    """Generate a deterministic document checklist for a case workspace."""

    _professional_keywords = (
        "eb",
        "express entry",
        "work",
        "skilled",
        "talent",
        "niw",
        "employment",
    )
    _investor_keywords = (
        "invest",
        "startup",
        "entrepreneur",
        "business",
        "golden visa",
        "founder",
    )
    _student_keywords = ("student", "study", "education", "f1", "f-1")

    def build(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        documents: list[Document],
    ) -> tuple[list[DocumentChecklistItemRead], DocumentChecklistSummaryRead]:
        templates = self._build_templates(profile=profile, immigration_case=immigration_case)
        checklist: list[DocumentChecklistItemRead] = []

        uploaded_items = 0
        processing_items = 0
        failed_items = 0
        completed_items = 0
        missing_required_items = 0

        for template in templates:
            matched_document = self._match_document(
                template=template,
                documents=documents,
            )
            status = self._resolve_status(matched_document)

            if status == ChecklistItemStatus.UPLOADED:
                uploaded_items += 1
                completed_items += 1
            elif status == ChecklistItemStatus.PROCESSING:
                processing_items += 1
            elif status == ChecklistItemStatus.FAILED:
                failed_items += 1
            elif template.requirement_level == ChecklistRequirementLevel.REQUIRED:
                missing_required_items += 1

            checklist.append(
                DocumentChecklistItemRead(
                    id=template.slug,
                    document_name=template.document_name,
                    category=template.category,
                    requirement_level=template.requirement_level,
                    status=status,
                    notes=self._build_notes(
                        template=template,
                        matched_document=matched_document,
                    ),
                    matched_document_id=matched_document.id if matched_document else None,
                )
            )

        readiness_points = completed_items * 1.0 + processing_items * 0.5
        readiness_score = round_score(
            (readiness_points / len(checklist) * 100) if checklist else 0
        )

        summary = DocumentChecklistSummaryRead(
            total_items=len(checklist),
            required_items=sum(
                1
                for item in checklist
                if item.requirement_level == ChecklistRequirementLevel.REQUIRED
            ),
            completed_items=completed_items,
            uploaded_items=uploaded_items,
            processing_items=processing_items,
            failed_items=failed_items,
            missing_required_items=missing_required_items,
            readiness_score=readiness_score,
        )
        return checklist, summary

    def _build_templates(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
    ) -> list[ChecklistTemplate]:
        program = (immigration_case.target_program or "").strip().lower()
        target_country = (immigration_case.target_country or profile.target_country or "").strip()

        templates: list[ChecklistTemplate] = [
            ChecklistTemplate(
                slug="passport",
                document_name="Passport identity page",
                category="identity",
                requirement_level=ChecklistRequirementLevel.REQUIRED,
                notes="A current passport is foundational for almost every migration workflow.",
                aliases=("passport", "travel document"),
            ),
            ChecklistTemplate(
                slug="cv_resume",
                document_name="Current CV or resume",
                category="professional",
                requirement_level=ChecklistRequirementLevel.RECOMMENDED,
                notes="A current career summary helps align pathway fit and later expert review.",
                aliases=("cv", "resume", "curriculum vitae"),
            ),
        ]

        if self._is_professional_case(program) or is_present(profile.profession):
            templates.extend(
                [
                    ChecklistTemplate(
                        slug="employment_references",
                        document_name="Employment reference letters",
                        category="professional",
                        requirement_level=ChecklistRequirementLevel.REQUIRED,
                        notes="Professional pathways typically rely on evidence of employment history and impact.",
                        aliases=("reference", "employment letter", "experience letter"),
                    ),
                    ChecklistTemplate(
                        slug="education_credentials",
                        document_name="Education credentials",
                        category="education",
                        requirement_level=ChecklistRequirementLevel.REQUIRED,
                        notes="Degrees or transcripts help validate skilled and merit-based routes.",
                        aliases=("degree", "diploma", "transcript", "education"),
                    ),
                ]
            )

        if self._is_student_case(program):
            templates.append(
                ChecklistTemplate(
                    slug="academic_records",
                    document_name="Academic records",
                    category="education",
                    requirement_level=ChecklistRequirementLevel.REQUIRED,
                    notes="Student pathways typically require transcripts or current academic records.",
                    aliases=("transcript", "academic record", "school record"),
                )
            )

        if self._is_investor_case(program):
            templates.extend(
                [
                    ChecklistTemplate(
                        slug="proof_of_funds",
                        document_name="Proof of funds",
                        category="financial",
                        requirement_level=ChecklistRequirementLevel.REQUIRED,
                        notes="Investor or founder pathways usually require capital evidence early.",
                        aliases=("funds", "bank", "statement", "capital"),
                    ),
                    ChecklistTemplate(
                        slug="business_plan",
                        document_name="Business plan or venture summary",
                        category="business",
                        requirement_level=ChecklistRequirementLevel.REQUIRED,
                        notes="Founders and investor cases need a structured plan for viability review.",
                        aliases=("business plan", "pitch deck", "venture", "startup"),
                    ),
                ]
            )
        elif target_country:
            templates.append(
                ChecklistTemplate(
                    slug="proof_of_funds",
                    document_name="Proof of funds",
                    category="financial",
                    requirement_level=ChecklistRequirementLevel.RECOMMENDED,
                    notes="Proof of funds helps product planning even before a route is final.",
                    aliases=("funds", "bank", "statement", "capital"),
                )
            )

        if profile.marital_status in {MaritalStatus.MARRIED, MaritalStatus.PARTNERED}:
            templates.append(
                ChecklistTemplate(
                    slug="marriage_certificate",
                    document_name="Marriage or partnership certificate",
                    category="family",
                    requirement_level=ChecklistRequirementLevel.REQUIRED,
                    notes="Family composition should be documented if a spouse or partner may be included.",
                    aliases=("marriage", "spouse", "partnership"),
                )
            )

        if profile.children_count and profile.children_count > 0:
            templates.append(
                ChecklistTemplate(
                    slug="dependent_birth_records",
                    document_name="Dependent birth records",
                    category="family",
                    requirement_level=ChecklistRequirementLevel.REQUIRED,
                    notes="Dependent planning is stronger when child records are available early.",
                    aliases=("birth certificate", "child", "dependent"),
                )
            )

        if profile.english_level is not None:
            templates.append(
                ChecklistTemplate(
                    slug="language_evidence",
                    document_name="Language proficiency evidence",
                    category="language",
                    requirement_level=ChecklistRequirementLevel.RECOMMENDED,
                    notes="Language evidence strengthens route comparison and future eligibility review.",
                    aliases=("ielts", "toefl", "language", "english"),
                )
            )

        if profile.prior_visa_refusal_flag:
            templates.append(
                ChecklistTemplate(
                    slug="refusal_explanation",
                    document_name="Prior refusal explanation",
                    category="risk",
                    requirement_level=ChecklistRequirementLevel.REQUIRED,
                    notes="Prior refusal history should be documented clearly before strategy escalation.",
                    aliases=("refusal", "denial", "rejection"),
                )
            )

        return templates

    def _match_document(
        self,
        *,
        template: ChecklistTemplate,
        documents: list[Document],
    ) -> Document | None:
        aliases = tuple(alias.lower() for alias in template.aliases)

        for document in documents:
            document_type = (document.document_type or "").strip().lower()
            filename = document.original_filename.strip().lower()
            haystack = f"{document_type} {filename}"
            if any(alias in haystack for alias in aliases):
                return document

        return None

    @staticmethod
    def _resolve_status(document: Document | None) -> ChecklistItemStatus:
        if document is None:
            return ChecklistItemStatus.MISSING

        if document.upload_status == DocumentUploadStatus.FAILED:
            return ChecklistItemStatus.FAILED

        if document.upload_status in {
            DocumentUploadStatus.PENDING,
            DocumentUploadStatus.PROCESSING,
        }:
            return ChecklistItemStatus.PROCESSING

        return ChecklistItemStatus.UPLOADED

    @staticmethod
    def _build_notes(
        *,
        template: ChecklistTemplate,
        matched_document: Document | None,
    ) -> str:
        if matched_document is None:
            return template.notes

        status = matched_document.upload_status.value.replace("_", " ")
        return (
            f"{template.notes} Current match: {matched_document.original_filename} "
            f"is marked as {status}."
        )

    def _is_professional_case(self, program: str) -> bool:
        return any(keyword in program for keyword in self._professional_keywords)

    def _is_investor_case(self, program: str) -> bool:
        return any(keyword in program for keyword in self._investor_keywords)

    def _is_student_case(self, program: str) -> bool:
        return any(keyword in program for keyword in self._student_keywords)
