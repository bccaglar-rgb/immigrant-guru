from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Sequence

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.ai import StrategyContextMode
from app.schemas.immigration_case import ImmigrationCaseRead
from app.schemas.user_profile import UserProfileRead

from app.services.ai.prompts.bundles import DocumentAnalysisPromptBundle

class DocumentAnalysisPromptBuilder:
    """Build a strict JSON prompt for analyzing extracted document text."""

    def build(
        self,
        *,
        document_type: str,
        extracted_text: str,
    ) -> DocumentAnalysisPromptBundle:
        normalized_document_type = document_type.strip()
        normalized_extracted_text = extracted_text.strip()

        structured_context = {
            "document_type": normalized_document_type,
            "extracted_text": normalized_extracted_text,
        }

        system_prompt = (
            "You are an immigration document analysis engine. "
            "Analyze the uploaded document and extract practical insights. "
            "Do not give legal advice or claim certainty about authenticity. "
            "Use only the supplied document type and extracted text. "
            "Focus on likely document classification, visible information, extraction gaps, and practical improvements. "
            "Return STRICT JSON only with the exact keys: document_classification, key_information, issues_detected, missing_information, improvement_suggestions."
        )

        user_prompt = "\n".join(
            [
                "INPUT:",
                f"Document Type: {normalized_document_type}",
                f"Extracted Text: {normalized_extracted_text}",
                "",
                "OUTPUT:",
                "{",
                '  "document_classification": "...",',
                '  "key_information": ["..."],',
                '  "issues_detected": ["..."],',
                '  "missing_information": ["..."],',
                '  "improvement_suggestions": ["..."]',
                "}",
            ]
        )

        return DocumentAnalysisPromptBundle(
            structured_context=structured_context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )


