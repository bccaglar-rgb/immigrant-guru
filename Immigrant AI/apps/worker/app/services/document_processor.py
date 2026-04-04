from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.immigration_case import ImmigrationCase
from app.models.enums import DocumentUploadStatus
from app.queues.document_jobs import DocumentProcessingJob
from app.services.document_pipeline import DocumentAnalysisPipeline

logger = logging.getLogger("immigrant-ai-worker.document-processor")


class DocumentProcessor:
    """Coordinate status transitions and analysis execution for document jobs."""

    def __init__(self, *, pipeline: DocumentAnalysisPipeline) -> None:
        self._pipeline = pipeline

    async def process(self, session: AsyncSession, job: DocumentProcessingJob) -> None:
        document = await session.get(Document, job.document_id)
        if document is None:
            logger.warning("document.missing", extra={"document_id": str(job.document_id)})
            return
        immigration_case = await session.get(ImmigrationCase, job.case_id)

        if document.upload_status == DocumentUploadStatus.PROCESSING:
            if document.processed_at is None:
                logger.warning(
                    "document.processing_resumed",
                    extra={"document_id": str(document.id), "case_id": str(document.case_id)},
                )
            else:
                logger.info(
                    "document.already_processing",
                    extra={"document_id": str(document.id)},
                )
                return

        if (
            document.upload_status == DocumentUploadStatus.UPLOADED
            and document.processed_at is not None
        ):
            logger.info("document.already_processed", extra={"document_id": str(document.id)})
            return

        await self._mark_processing_started(session, document)

        try:
            analysis_metadata = await self._pipeline.analyze(document, immigration_case)
        except Exception as exc:
            await self._mark_processing_failed(session, document, exc)
            return

        await self._mark_processing_completed(session, document, analysis_metadata)

    async def mark_terminal_failure(
        self,
        session: AsyncSession,
        *,
        document_id: UUID,
        case_id: UUID,
        error_message: str,
    ) -> None:
        document = await session.get(Document, document_id)
        if document is None:
            logger.warning("document.terminal_failure_missing", extra={"document_id": str(document_id)})
            return

        if document.upload_status == DocumentUploadStatus.UPLOADED:
            return

        logger.error(
            "document.processing_retries_exhausted",
            extra={"document_id": str(document_id), "case_id": str(case_id)},
        )
        document.upload_status = DocumentUploadStatus.FAILED
        document.processing_error = error_message[:500]
        document.analysis_metadata = {
            **(document.analysis_metadata or {}),
            "last_failure": {
                "message": document.processing_error,
                "failed_at": datetime.now(timezone.utc).isoformat(),
                "source": "worker_retry_exhausted",
            },
        }
        await session.commit()
        await session.refresh(document)

    async def _mark_processing_started(
        self,
        session: AsyncSession,
        document: Document,
    ) -> None:
        document.upload_status = DocumentUploadStatus.PROCESSING
        document.processing_attempts += 1
        document.processing_error = None
        await session.commit()
        await session.refresh(document)

    async def _mark_processing_completed(
        self,
        session: AsyncSession,
        document: Document,
        analysis_metadata: dict[str, Any],
    ) -> None:
        classification = analysis_metadata.get("classification") or {}
        inferred_type = classification.get("document_type")

        document.upload_status = DocumentUploadStatus.UPLOADED
        document.processed_at = datetime.now(timezone.utc)
        document.processing_error = None
        document.analysis_metadata = analysis_metadata
        if not document.document_type and isinstance(inferred_type, str):
            document.document_type = inferred_type[:120]

        await session.commit()
        await session.refresh(document)

    async def _mark_processing_failed(
        self,
        session: AsyncSession,
        document: Document,
        error: Exception,
    ) -> None:
        logger.exception(
            "document.processing_failed",
            extra={"document_id": str(document.id), "case_id": str(document.case_id)},
            exc_info=error,
        )
        document.upload_status = DocumentUploadStatus.FAILED
        document.processing_error = str(error)[:500] or "Document processing failed."
        document.analysis_metadata = {
            **(document.analysis_metadata or {}),
            "last_failure": {
                "message": document.processing_error,
                "failed_at": datetime.now(timezone.utc).isoformat(),
            },
        }
        await session.commit()
        await session.refresh(document)
