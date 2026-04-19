from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from app.models.enums import DocumentUploadStatus
from app.services.documents.document_audit_service import DocumentAuditService
from app.services.documents.document_checklist_service import DocumentChecklistService


def _document(
    *,
    document_type: str,
    upload_status: DocumentUploadStatus = DocumentUploadStatus.UPLOADED,
    analysis_metadata: dict | None = None,
    processing_error: str | None = None,
):
    return SimpleNamespace(
        id=uuid4(),
        document_type=document_type,
        original_filename=f"{document_type}.pdf",
        filename=f"{document_type}.pdf",
        upload_status=upload_status,
        analysis_metadata=analysis_metadata or {},
        processing_error=processing_error,
    )


def test_document_audit_flags_missing_required_documents() -> None:
    service = DocumentAuditService(checklist_service=DocumentChecklistService())
    profile = SimpleNamespace(
        profession="Engineer",
        marital_status=None,
        children_count=0,
        english_level="advanced",
        prior_visa_refusal_flag=False,
    )
    immigration_case = SimpleNamespace(
        target_program="EB-2 NIW",
        target_country="United States",
    )
    documents = [_document(document_type="passport")]

    response = service.audit(
        profile=profile,
        immigration_case=immigration_case,
        documents=documents,
    )

    assert "Employment reference letters" in response.missing_documents
    assert response.risk_level == "high"


def test_document_audit_surfaces_quality_and_processing_issues() -> None:
    service = DocumentAuditService(checklist_service=DocumentChecklistService())
    profile = SimpleNamespace(
        profession="Engineer",
        marital_status=None,
        children_count=0,
        english_level="advanced",
        prior_visa_refusal_flag=False,
    )
    immigration_case = SimpleNamespace(
        target_program="Express Entry",
        target_country="Canada",
    )
    documents = [
        _document(
            document_type="passport",
            analysis_metadata={
                "intelligence": {
                    "completeness": {"score": 42},
                    "issues_detected": [
                        {
                            "title": "Blurred identity page",
                            "description": "The passport number cannot be read clearly.",
                        }
                    ],
                    "missing_required_information": ["Expiry date"],
                }
            },
        ),
        _document(
            document_type="education_credentials",
            upload_status=DocumentUploadStatus.PROCESSING,
        ),
    ]

    response = service.audit(
        profile=profile,
        immigration_case=immigration_case,
        documents=documents,
    )

    assert any("low completeness score" in issue for issue in response.issues_found)
    assert any("still processing" in issue for issue in response.issues_found)
    assert response.risk_level == "medium"
    assert response.recommendations
