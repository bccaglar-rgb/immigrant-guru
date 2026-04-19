from __future__ import annotations

import logging
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.enums import AuditEventType, AuditTargetEntityType, DocumentUploadStatus
from app.models.user import User
from app.services.shared.audit_service import AuditService
from app.services.cases.case_service import CaseService
from app.services.documents.document_job_dispatcher import (
    DocumentJobDispatchError,
    DocumentJobDispatcher,
)
from app.services.documents.document_storage import (
    DocumentStorageError,
    LocalDocumentStorage,
)

logger = logging.getLogger("immigrant-ai-api.documents")


class DocumentService:
    """Manage case-scoped documents and storage metadata."""

    _allowed_extensions = {
        ".doc",
        ".docx",
        ".jpeg",
        ".jpg",
        ".pdf",
        ".png",
        ".webp",
    }
    _allowed_content_types = {
        "application/msword",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "image/png",
        "image/webp",
    }

    def __init__(
        self,
        *,
        audit_service: AuditService | None = None,
        case_service: CaseService,
        dispatcher: DocumentJobDispatcher | None = None,
        storage: LocalDocumentStorage,
        max_upload_bytes: int,
    ) -> None:
        self._audit_service = audit_service or AuditService()
        self._case_service = case_service
        self._dispatcher = dispatcher
        self._storage = storage
        self._max_upload_bytes = max_upload_bytes

    async def upload_case_document(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
        upload_file: UploadFile,
        document_type: str | None = None,
    ) -> Document:
        immigration_case = await self._case_service.get_case(session, user, case_id)
        self._validate_upload(upload_file=upload_file, document_type=document_type)

        try:
            stored = await self._storage.save_case_file(
                case_id=str(immigration_case.id),
                upload_file=upload_file,
            )
        except DocumentStorageError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        if stored.size > self._max_upload_bytes:
            self._cleanup_stored_file(stored.storage_path)
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Document exceeds the maximum upload size of {self._max_upload_bytes} bytes.",
            )

        document = Document(
            case_id=immigration_case.id,
            filename=stored.filename,
            original_filename=Path(upload_file.filename or stored.filename).name,
            mime_type=upload_file.content_type or "application/octet-stream",
            size=stored.size,
            storage_path=stored.storage_path,
            upload_status=DocumentUploadStatus.PENDING,
            document_type=document_type.strip() if document_type else None,
            processing_attempts=0,
            processed_at=None,
            processing_error=None,
            analysis_metadata={},
        )

        try:
            session.add(document)
            await session.commit()
            await session.refresh(document)
        except Exception:
            await session.rollback()
            self._cleanup_stored_file(stored.storage_path)
            raise

        queue_enqueued = await self._dispatch_processing_job(
            session=session,
            document=document,
        )
        await self._audit_service.record_event(
            session,
            actor_user_id=user.id,
            event_type=AuditEventType.DOCUMENT_UPLOADED,
            target_entity_type=AuditTargetEntityType.DOCUMENT,
            target_entity_id=document.id,
            metadata={
                "case_id": immigration_case.id,
                "original_filename": document.original_filename,
                "mime_type": document.mime_type,
                "size": document.size,
                "document_type": document.document_type,
                "queue_enqueued": queue_enqueued,
                "upload_status": document.upload_status,
            },
        )
        return document

    async def list_case_documents(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
    ) -> list[Document]:
        immigration_case = await self._case_service.get_case(session, user, case_id)

        result = await session.execute(
            select(Document)
            .where(Document.case_id == immigration_case.id)
            .order_by(Document.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    def _validate_upload(*, upload_file: UploadFile, document_type: str | None) -> None:
        filename = Path(upload_file.filename or "").name.strip()
        if not filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file must include a filename.",
            )

        if len(filename) > 255:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded filename is too long.",
            )

        extension = Path(filename).suffix.lower()
        if extension not in DocumentService._allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This file type is not supported. Upload PDF, DOC, DOCX, JPG, PNG, or WEBP files.",
            )

        content_type = (upload_file.content_type or "").strip().lower()
        if (
            content_type
            and content_type != "application/octet-stream"
            and content_type not in DocumentService._allowed_content_types
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This document content type is not supported.",
            )

        if document_type is not None and len(document_type.strip()) > 120:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Document type is too long.",
            )

    def _cleanup_stored_file(self, storage_path: str) -> None:
        try:
            self._storage.delete(storage_path)
        except DocumentStorageError:
            logger.exception(
                "Failed to clean up stored document after upload failure: %s",
                storage_path,
            )

    async def _dispatch_processing_job(
        self,
        *,
        session: AsyncSession,
        document: Document,
    ) -> bool:
        if self._dispatcher is None:
            return False

        try:
            await self._dispatcher.enqueue_document_processing(
                document_id=document.id,
                case_id=document.case_id,
            )
            return True
        except DocumentJobDispatchError:
            document.upload_status = DocumentUploadStatus.FAILED
            document.processing_error = "Document was stored, but background processing could not be queued."

            try:
                await session.commit()
                await session.refresh(document)
            except Exception:
                await session.rollback()
                logger.exception(
                    "Failed to persist document dispatch failure state for %s",
                    document.id,
                )

            return False
