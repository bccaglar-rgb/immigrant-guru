from __future__ import annotations

from typing import Any


class DocumentIssueDetectionService:
    """Detect practical issues in extracted document content."""

    def detect(
        self,
        *,
        document_type: str,
        text_extraction: dict[str, Any],
        classification: dict[str, Any],
    ) -> dict[str, Any]:
        issues: list[dict[str, str]] = []
        missing_information: list[str] = []

        text_status = str(text_extraction.get("status") or "").strip().lower()
        text_preview = str(text_extraction.get("text_preview") or "").strip()
        text_length = int(text_extraction.get("text_length") or 0)

        if text_status != "completed":
            issues.append(
                {
                    "code": "text_unavailable",
                    "severity": "high",
                    "title": "Text extraction is incomplete",
                    "description": "The document could not be read into usable text, so deeper validation is limited.",
                }
            )
        elif text_length < 40:
            issues.append(
                {
                    "code": "very_low_text_volume",
                    "severity": "medium",
                    "title": "Very little readable text was found",
                    "description": "The extracted text is too short for reliable field validation and may indicate a weak scan or partial upload.",
                }
            )

        normalized_type = document_type.lower()
        preview_lower = text_preview.lower()

        if normalized_type == "passport":
            if "passport" not in preview_lower:
                missing_information.append("Passport identifier or heading is not clearly visible in the extracted text.")
            if "nationality" not in preview_lower:
                missing_information.append("Nationality is not clearly visible in the extracted text.")
            if "expiry" not in preview_lower and "expires" not in preview_lower:
                missing_information.append("Passport expiry date is not clearly visible.")
        elif normalized_type in {"bank_statement", "proof_of_funds"}:
            if "balance" not in preview_lower:
                missing_information.append("Account balance is not clearly visible in the extracted text.")
            if "statement" not in preview_lower and "bank" not in preview_lower:
                issues.append(
                    {
                        "code": "weak_financial_signal",
                        "severity": "medium",
                        "title": "Financial document signals are weak",
                        "description": "The extracted content does not strongly resemble a financial statement or proof-of-funds record.",
                    }
                )
        elif normalized_type in {"education_record", "academic_records"}:
            if "degree" not in preview_lower and "diploma" not in preview_lower and "transcript" not in preview_lower:
                missing_information.append("Degree, diploma, or transcript signals are not clearly visible.")
        elif normalized_type in {"employment_references", "resume"}:
            if "experience" not in preview_lower and "employment" not in preview_lower and "position" not in preview_lower:
                issues.append(
                    {
                        "code": "weak_employment_signal",
                        "severity": "medium",
                        "title": "Employment evidence signals are weak",
                        "description": "The extracted content does not clearly show work history, role, or employer context.",
                    }
                )

        if classification.get("confidence") == "heuristic":
            issues.append(
                {
                    "code": "heuristic_classification",
                    "severity": "low",
                    "title": "Classification is heuristic",
                    "description": "The document type was inferred from filename or light signals and may need confirmation.",
                }
            )

        summary = (
            "Issues were detected that may weaken analysis quality."
            if issues or missing_information
            else "No major analysis issues were detected from the available content."
        )

        return {
            "items": issues,
            "missing_information": missing_information[:8],
            "summary": summary,
        }
