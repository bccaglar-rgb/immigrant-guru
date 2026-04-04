from io import BytesIO

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile

from app.services.document_service import DocumentService


def build_upload_file(filename: str, content_type: str) -> UploadFile:
    return UploadFile(
        file=BytesIO(b"file-content"),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def test_document_service_rejects_unsupported_extension() -> None:
    with pytest.raises(HTTPException) as exc_info:
        DocumentService._validate_upload(
            upload_file=build_upload_file("malware.exe", "application/octet-stream"),
            document_type=None,
        )

    assert exc_info.value.status_code == 400
    assert "not supported" in str(exc_info.value.detail).lower()


def test_document_service_rejects_unsupported_content_type() -> None:
    with pytest.raises(HTTPException) as exc_info:
        DocumentService._validate_upload(
            upload_file=build_upload_file("passport.pdf", "application/x-msdownload"),
            document_type=None,
        )

    assert exc_info.value.status_code == 400
    assert "content type" in str(exc_info.value.detail).lower()


def test_document_service_accepts_supported_file() -> None:
    DocumentService._validate_upload(
        upload_file=build_upload_file("passport.pdf", "application/pdf"),
        document_type="Passport",
    )
