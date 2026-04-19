from __future__ import annotations

from app.models.document import Document
from app.models.enums import DocumentUploadStatus
from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.document import DocumentAuditResponse
from app.schemas.workspace import ChecklistItemStatus
from app.services.documents.document_checklist_service import DocumentChecklistService


class DocumentAuditService:
    """Deterministic compliance-focused audit over uploaded case documents."""

    def __init__(self, *, checklist_service: DocumentChecklistService) -> None:
        self._checklist_service = checklist_service

    def audit(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        documents: list[Document],
    ) -> DocumentAuditResponse:
        checklist, summary = self._checklist_service.build(
            profile=profile,
            immigration_case=immigration_case,
            documents=documents,
        )

        detected_documents = [
            self._display_document_name(document=document)
            for document in documents
        ]

        missing_documents = [
            item.document_name
            for item in checklist
            if item.requirement_level.value == "required"
            and item.status in {ChecklistItemStatus.MISSING, ChecklistItemStatus.FAILED}
        ]

        issues_found: list[str] = []
        for document in documents:
            issues_found.extend(self._collect_document_issues(document=document))
        if summary.processing_items:
            issues_found.append(
                f"{summary.processing_items} document(s) are still processing and cannot yet be treated as compliance-ready."
            )
        if summary.failed_items:
            issues_found.append(
                f"{summary.failed_items} document(s) failed processing and should be re-uploaded or reviewed."
            )

        issues_found = self._dedupe(issues_found)
        recommendations = self._build_recommendations(
            missing_documents=missing_documents,
            issues_found=issues_found,
            summary=summary,
        )
        risk_level = self._risk_level(
            missing_documents=missing_documents,
            issues_found=issues_found,
            summary=summary,
        )

        return DocumentAuditResponse(
            detected_documents=detected_documents,
            missing_documents=missing_documents,
            issues_found=issues_found,
            risk_level=risk_level,
            recommendations=recommendations,
        )

    @staticmethod
    def _display_document_name(*, document: Document) -> str:
        return document.document_type or document.original_filename or document.filename

    def _collect_document_issues(self, *, document: Document) -> list[str]:
        issues: list[str] = []
        if document.upload_status == DocumentUploadStatus.FAILED and document.processing_error:
            issues.append(
                f"{self._display_document_name(document=document)} failed processing: {document.processing_error}"
            )

        intelligence = (
            (document.analysis_metadata or {}).get("intelligence") or {}
        )
        completeness = intelligence.get("completeness") or {}
        completeness_score = completeness.get("score")
        if isinstance(completeness_score, (int, float)) and completeness_score < 60:
            issues.append(
                f"{self._display_document_name(document=document)} has a low completeness score ({round(float(completeness_score), 1)})."
            )

        for issue in intelligence.get("issues_detected") or []:
            if isinstance(issue, dict):
                title = issue.get("title") or issue.get("code") or "Document issue detected"
                description = issue.get("description")
                if description:
                    issues.append(f"{self._display_document_name(document=document)}: {title} - {description}")
                else:
                    issues.append(f"{self._display_document_name(document=document)}: {title}")
            elif isinstance(issue, str) and issue.strip():
                issues.append(f"{self._display_document_name(document=document)}: {issue.strip()}")

        for missing in intelligence.get("missing_required_information") or []:
            if isinstance(missing, str) and missing.strip():
                issues.append(
                    f"{self._display_document_name(document=document)} is missing required information: {missing.strip()}"
                )

        return issues

    @staticmethod
    def _risk_level(
        *,
        missing_documents: list[str],
        issues_found: list[str],
        summary,
    ) -> str:
        if summary.failed_items > 0 or len(missing_documents) >= 2:
            return "high"
        if missing_documents or issues_found or summary.processing_items > 0:
            return "medium"
        return "low"

    @staticmethod
    def _build_recommendations(
        *,
        missing_documents: list[str],
        issues_found: list[str],
        summary,
    ) -> list[str]:
        recommendations: list[str] = []
        if missing_documents:
            recommendations.append(
                "Upload the highest-priority missing required documents before relying on the case for filing readiness."
            )
        if summary.failed_items:
            recommendations.append(
                "Re-upload failed documents with cleaner files and confirmed document types."
            )
        if summary.processing_items:
            recommendations.append(
                "Wait for processing to complete before treating newly uploaded files as compliance-ready."
            )
        if any("low completeness score" in issue for issue in issues_found):
            recommendations.append(
                "Replace low-quality or incomplete scans with clearer, full-page documents."
            )
        if any("missing required information" in issue for issue in issues_found):
            recommendations.append(
                "Review document fields carefully and ensure key dates, names, and identifiers are visible."
            )
        if not recommendations:
            recommendations.append(
                "Keep documents current and aligned with the target pathway before filing or expert review."
            )
        return recommendations[:12]

    @staticmethod
    def _dedupe(items: list[str]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for item in items:
            normalized = item.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(normalized)
        return deduped[:20]
