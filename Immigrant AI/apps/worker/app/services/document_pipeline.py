from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.models.document import Document


class DocumentPipelineError(RuntimeError):
    """Raised when document analysis cannot proceed."""


class DocumentAnalysisPipeline:
    """Extensible document analysis skeleton for OCR, parsing, and classification."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def analyze(self, document: Document) -> dict[str, Any]:
        absolute_path = (self._settings.local_storage_root_path / document.storage_path).resolve()
        if not absolute_path.exists():
            raise DocumentPipelineError("Stored document file could not be found.")

        text_extraction = await self._extract_text(document, absolute_path)
        classification = self._classify_document(document)

        return {
            "pipeline_version": "0.1.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "ocr": {
                "status": "not_configured",
                "message": "OCR provider is not configured in v1.",
            },
            "text_extraction": text_extraction,
            "classification": classification,
            "structured_field_extraction": {
                "status": "not_configured",
                "fields": {},
            },
        }

    async def _extract_text(self, document: Document, absolute_path: Path) -> dict[str, Any]:
        if not self._supports_plain_text(document, absolute_path):
            return {
                "status": "skipped",
                "message": "Binary document text extraction is not configured in v1.",
                "text_preview": None,
                "text_length": 0,
            }

        try:
            content = absolute_path.read_text(encoding="utf-8", errors="ignore")
        except OSError as exc:
            raise DocumentPipelineError("Document text could not be read.") from exc

        preview = content[: self._settings.document_text_preview_chars].strip()
        return {
            "status": "completed",
            "message": "Text extracted from plain-text compatible file.",
            "text_preview": preview or None,
            "text_length": len(content),
        }

    @staticmethod
    def _supports_plain_text(document: Document, absolute_path: Path) -> bool:
        if document.mime_type.startswith("text/"):
            return True

        return absolute_path.suffix.lower() in {".txt", ".md", ".csv", ".json"}

    @staticmethod
    def _classify_document(document: Document) -> dict[str, Any]:
        filename = document.original_filename.lower()
        existing_type = (document.document_type or "").strip()

        if existing_type:
            return {
                "status": "completed",
                "document_type": existing_type,
                "confidence": "user_provided",
            }

        inferred_type = "general_supporting_document"
        if "passport" in filename:
            inferred_type = "passport"
        elif "resume" in filename or "cv" in filename:
            inferred_type = "resume"
        elif "bank" in filename or "statement" in filename:
            inferred_type = "bank_statement"
        elif "degree" in filename or "diploma" in filename:
            inferred_type = "education_record"
        elif "refusal" in filename:
            inferred_type = "visa_refusal_record"

        return {
            "status": "completed",
            "document_type": inferred_type,
            "confidence": "heuristic",
        }
