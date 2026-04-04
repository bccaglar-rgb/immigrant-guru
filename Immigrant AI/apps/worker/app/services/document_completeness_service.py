from __future__ import annotations

from typing import Any


class DocumentCompletenessService:
    """Score how complete a document appears for its inferred type."""

    _required_signals = {
        "passport": ("passport", "nationality", "expiry"),
        "bank_statement": ("bank", "statement", "balance"),
        "proof_of_funds": ("fund", "balance", "statement"),
        "education_record": ("degree", "diploma", "transcript"),
        "employment_references": ("employment", "reference", "position"),
        "resume": ("experience", "education", "skills"),
        "visa_refusal_record": ("refusal", "decision", "application"),
    }

    def evaluate(
        self,
        *,
        document_type: str,
        key_information: list[dict[str, str]],
        issues: dict[str, Any],
        text_extraction: dict[str, Any],
    ) -> dict[str, Any]:
        normalized_type = document_type.lower()
        preview = str(text_extraction.get("text_preview") or "").lower()
        required_signals = self._required_signals.get(normalized_type, ())

        matched_signals = [
            signal for signal in required_signals if signal in preview
        ]
        signal_score = (
            (len(matched_signals) / len(required_signals)) * 100
            if required_signals
            else 65.0
        )
        key_info_bonus = min(len(key_information) * 6, 18)
        issue_penalty = min(len(issues.get("items", [])) * 9, 27)
        missing_penalty = min(len(issues.get("missing_information", [])) * 7, 28)
        status_penalty = 0 if text_extraction.get("status") == "completed" else 25

        completeness_score = max(
            0.0,
            min(100.0, round(signal_score + key_info_bonus - issue_penalty - missing_penalty - status_penalty, 1)),
        )

        if completeness_score >= 80:
            summary = "The document appears materially usable for case preparation."
        elif completeness_score >= 60:
            summary = "The document is directionally useful but still has visible gaps or weak signals."
        else:
            summary = "The document appears incomplete or too weak for reliable case use."

        return {
            "score": completeness_score,
            "matched_signals": matched_signals,
            "missing_required_information": issues.get("missing_information", [])[:8],
            "summary": summary,
        }
