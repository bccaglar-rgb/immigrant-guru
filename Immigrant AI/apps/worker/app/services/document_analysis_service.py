from __future__ import annotations

import re
from typing import Any

from app.models.document import Document
from app.models.immigration_case import ImmigrationCase
from app.services.document_completeness_service import DocumentCompletenessService
from app.services.document_issue_detection_service import DocumentIssueDetectionService


class DocumentAnalysisService:
    """Assemble deterministic document intelligence from extracted content."""

    def __init__(
        self,
        *,
        completeness_service: DocumentCompletenessService | None = None,
        issue_detection_service: DocumentIssueDetectionService | None = None,
    ) -> None:
        self._completeness_service = (
            completeness_service or DocumentCompletenessService()
        )
        self._issue_detection_service = (
            issue_detection_service or DocumentIssueDetectionService()
        )

    def analyze(
        self,
        *,
        document: Document,
        immigration_case: ImmigrationCase | None,
        text_extraction: dict[str, Any],
        classification: dict[str, Any],
    ) -> dict[str, Any]:
        document_type = str(
            classification.get("document_type")
            or document.document_type
            or "general_supporting_document"
        )
        text_preview = str(text_extraction.get("text_preview") or "")
        key_information = self._extract_key_information(
            document_type=document_type,
            text_preview=text_preview,
        )
        issues = self._issue_detection_service.detect(
            document_type=document_type,
            text_extraction=text_extraction,
            classification=classification,
        )
        completeness = self._completeness_service.evaluate(
            document_type=document_type,
            key_information=key_information,
            issues=issues,
            text_extraction=text_extraction,
        )
        relevance = self._assess_relevance(
            document_type=document_type,
            immigration_case=immigration_case,
        )

        return {
            "analysis_version": "1.0.0",
            "document_classification": {
                "document_type": document_type,
                "confidence": classification.get("confidence", "unknown"),
                "summary": self._classification_summary(document_type),
            },
            "key_information": key_information[:8],
            "issues_detected": issues["items"][:8],
            "missing_required_information": issues["missing_information"][:8],
            "improvement_suggestions": self._build_improvement_suggestions(
                document_type=document_type,
                issues=issues,
                completeness=completeness,
            )[:8],
            "relevance_to_pathway": relevance,
            "completeness": completeness,
        }

    def _extract_key_information(
        self,
        *,
        document_type: str,
        text_preview: str,
    ) -> list[dict[str, str]]:
        preview = text_preview.strip()
        preview_lower = preview.lower()
        items: list[dict[str, str]] = []

        if not preview:
            return items

        date_match = re.search(r"\b(20\d{2}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})\b", preview)
        if date_match:
            items.append(
                {
                    "label": "Detected date",
                    "value": date_match.group(1),
                    "confidence": "medium",
                }
            )

        money_match = re.search(r"\$?\b\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b", preview)
        if money_match and document_type in {"bank_statement", "proof_of_funds"}:
            items.append(
                {
                    "label": "Detected amount",
                    "value": money_match.group(0),
                    "confidence": "medium",
                }
            )

        if "nationality" in preview_lower:
            items.append(
                {
                    "label": "Nationality marker",
                    "value": "Detected",
                    "confidence": "medium",
                }
            )
        if "passport" in preview_lower:
            items.append(
                {
                    "label": "Passport signal",
                    "value": "Detected",
                    "confidence": "high",
                }
            )
        if "employment" in preview_lower or "experience" in preview_lower:
            items.append(
                {
                    "label": "Employment signal",
                    "value": "Detected",
                    "confidence": "medium",
                }
            )
        if "degree" in preview_lower or "diploma" in preview_lower or "transcript" in preview_lower:
            items.append(
                {
                    "label": "Education signal",
                    "value": "Detected",
                    "confidence": "medium",
                }
            )

        return items

    @staticmethod
    def _assess_relevance(
        *,
        document_type: str,
        immigration_case: ImmigrationCase | None,
    ) -> dict[str, Any]:
        target_program = (immigration_case.target_program or "").lower() if immigration_case else ""
        skilled = any(
            keyword in target_program
            for keyword in ("express entry", "skilled", "worker", "niw", "employment", "blue card", "talent")
        )
        investor = any(
            keyword in target_program
            for keyword in ("invest", "startup", "entrepreneur", "business", "golden visa", "founder")
        )
        student = any(keyword in target_program for keyword in ("student", "study", "education"))

        high_relevance_types = {"passport"}
        if skilled:
            high_relevance_types.update({"employment_references", "resume", "education_record"})
        if investor:
            high_relevance_types.update({"bank_statement", "proof_of_funds", "business_plan"})
        if student:
            high_relevance_types.update({"education_record", "academic_records", "proof_of_funds"})

        if document_type in high_relevance_types:
            score = 88.0
            alignment = "high"
            reasoning = "This document type is strongly aligned with the current case direction."
        elif document_type == "general_supporting_document":
            score = 45.0
            alignment = "medium"
            reasoning = "The document may still support the case, but its pathway relevance is not yet strongly confirmed."
        else:
            score = 62.0
            alignment = "medium"
            reasoning = "The document is potentially relevant, but it is not one of the strongest evidence types for this pathway."

        return {
            "score": score,
            "pathway_alignment": alignment,
            "reasoning": reasoning,
            "target_program": immigration_case.target_program if immigration_case else None,
            "target_country": immigration_case.target_country if immigration_case else None,
        }

    @staticmethod
    def _build_improvement_suggestions(
        *,
        document_type: str,
        issues: dict[str, Any],
        completeness: dict[str, Any],
    ) -> list[str]:
        suggestions: list[str] = []

        if completeness["score"] < 60:
            suggestions.append(
                "Upload a clearer, more complete version of the document so key fields can be validated reliably."
            )
        if issues["missing_information"]:
            suggestions.append(
                "Make sure the next upload clearly shows the missing fields currently not visible in extracted text."
            )
        if any(item["code"] == "heuristic_classification" for item in issues["items"]):
            suggestions.append(
                f"Confirm the document type explicitly if this {document_type.replace('_', ' ')} record is important for the case."
            )
        if any(item["code"] == "text_unavailable" for item in issues["items"]):
            suggestions.append(
                "Use a higher-quality scan or OCR-friendly file format so the system can extract usable text."
            )
        if not suggestions:
            suggestions.append(
                "Keep the document current and ensure all visible data matches the rest of the case record."
            )

        return suggestions

    @staticmethod
    def _classification_summary(document_type: str) -> str:
        return f"The document appears to be a {document_type.replace('_', ' ')}."
