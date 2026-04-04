from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.models.enums import DocumentUploadStatus
from app.queues.document_jobs import DocumentProcessingJob
from app.services.document_pipeline import DocumentAnalysisPipeline, DocumentPipelineError
from app.services.document_processor import DocumentProcessor


@pytest.mark.asyncio
async def test_pipeline_extracts_text_from_plain_text_files(tmp_path: Path) -> None:
    storage_root = tmp_path / "storage"
    document_path = storage_root / "documents" / "case-1" / "note.txt"
    document_path.parent.mkdir(parents=True, exist_ok=True)
    document_path.write_text("Proof of funds available.\nSalary record attached.", encoding="utf-8")

    settings = Settings(
        local_storage_root=str(storage_root),
        document_text_preview_chars=25,
    )
    pipeline = DocumentAnalysisPipeline(settings)
    document = SimpleNamespace(
        storage_path="documents/case-1/note.txt",
        mime_type="text/plain",
        original_filename="bank_note.txt",
        document_type=None,
    )

    result = await pipeline.analyze(document)

    assert result["text_extraction"]["status"] == "completed"
    assert result["text_extraction"]["text_preview"] == "Proof of funds available."
    assert result["classification"]["document_type"] == "bank_statement"


@pytest.mark.asyncio
async def test_pipeline_raises_when_file_is_missing(tmp_path: Path) -> None:
    settings = Settings(local_storage_root=str(tmp_path / "storage"))
    pipeline = DocumentAnalysisPipeline(settings)
    document = SimpleNamespace(
        storage_path="documents/missing/file.pdf",
        mime_type="application/pdf",
        original_filename="file.pdf",
        document_type=None,
    )

    with pytest.raises(DocumentPipelineError):
        await pipeline.analyze(document)


@pytest.mark.asyncio
async def test_processor_resumes_processing_documents_after_retry() -> None:
    class FakeSession:
        def __init__(self, document) -> None:
            self.document = document

        async def get(self, model, document_id):
            del model, document_id
            return self.document

        async def commit(self) -> None:
            return None

        async def refresh(self, document) -> None:
            del document
            return None

    class FakePipeline:
        async def analyze(self, document):
            return {
                "classification": {"document_type": "passport"},
                "text_extraction": {"status": "completed"},
            }

    document = SimpleNamespace(
        id="doc-1",
        case_id="case-1",
        upload_status=DocumentUploadStatus.PROCESSING,
        processed_at=None,
        processing_error=None,
        processing_attempts=1,
        document_type=None,
        analysis_metadata={},
    )
    job = DocumentProcessingJob(
        job_type="document_post_upload_processing",
        document_id="00000000-0000-0000-0000-000000000001",
        case_id="00000000-0000-0000-0000-000000000002",
        retry_count=1,
        enqueued_at="2026-04-03T12:00:00Z",
    )

    processor = DocumentProcessor(pipeline=FakePipeline())
    session = FakeSession(document)

    await processor.process(session, job)

    assert document.upload_status == DocumentUploadStatus.UPLOADED
    assert document.processed_at is not None
    assert document.document_type == "passport"
