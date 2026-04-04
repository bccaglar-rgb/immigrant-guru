from decimal import Decimal
from uuid import uuid4

from app.models.document import Document
from app.models.enums import (
    DocumentUploadStatus,
    EducationLevel,
    EnglishLevel,
    ImmigrationCaseStatus,
    MaritalStatus,
    RelocationTimeline,
)
from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.services.case_workspace_service import CaseWorkspaceService


def make_profile() -> UserProfile:
    return UserProfile(
        id=uuid4(),
        user_id=uuid4(),
        nationality="Turkish",
        current_country="Canada",
        target_country="United States",
        marital_status=MaritalStatus.MARRIED,
        children_count=1,
        education_level=EducationLevel.BACHELOR,
        english_level=EnglishLevel.ADVANCED,
        profession="Software engineer",
        years_of_experience=6,
        available_capital=Decimal("45000.00"),
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
        relocation_timeline=RelocationTimeline.WITHIN_6_MONTHS,
        preferred_language="en",
    )


def make_case() -> ImmigrationCase:
    return ImmigrationCase(
        id=uuid4(),
        user_id=uuid4(),
        title="U.S. skilled worker migration plan",
        target_country="United States",
        target_program="EB-2 NIW",
        current_stage="eligibility_review",
        status=ImmigrationCaseStatus.IN_REVIEW,
        notes="Collect stronger evidence of impact.",
        latest_score=Decimal("72.00"),
        risk_score=Decimal("24.00"),
    )


def make_document(
    *,
    document_type: str,
    original_filename: str,
    upload_status: DocumentUploadStatus,
) -> Document:
    return Document(
        id=uuid4(),
        case_id=uuid4(),
        filename=f"{uuid4().hex}_{original_filename}",
        original_filename=original_filename,
        mime_type="application/pdf",
        size=1024,
        storage_path=f"documents/{uuid4().hex}/{original_filename}",
        upload_status=upload_status,
        document_type=document_type,
        processing_attempts=0,
        analysis_metadata={},
    )


def test_case_workspace_builds_checklist_health_and_actions() -> None:
    service = CaseWorkspaceService()

    workspace = service.build(
        profile=make_profile(),
        immigration_case=make_case(),
        documents=[
            make_document(
                document_type="passport",
                original_filename="passport.pdf",
                upload_status=DocumentUploadStatus.UPLOADED,
            ),
            make_document(
                document_type="employment letter",
                original_filename="employment-reference.pdf",
                upload_status=DocumentUploadStatus.PROCESSING,
            ),
        ],
    )

    assert workspace.health.health_status in {
        "needs_attention",
        "strong",
        "incomplete",
        "at_risk",
    }
    assert workspace.case_health.health_status == workspace.health.health_status
    assert workspace.readiness_score.overall_score >= 0
    assert workspace.probability_summary.confidence_level in {"LOW", "MEDIUM", "HIGH"}
    assert workspace.timeline_summary.total_estimated_duration_months >= 0
    assert workspace.document_status_summary.readiness_score == workspace.checklist_summary.readiness_score
    assert workspace.recommended_pathway.rationale
    assert workspace.top_risks
    assert workspace.missing_information_grouped.critical == [
        item.message for item in workspace.missing_information if item.severity == "critical"
    ]
    assert workspace.checklist_summary.total_items >= 4
    assert workspace.checklist_summary.uploaded_items >= 1
    assert workspace.next_best_action.title
    assert workspace.roadmap
    assert workspace.action_roadmap == workspace.roadmap


def test_case_workspace_flags_incomplete_case() -> None:
    service = CaseWorkspaceService()
    sparse_profile = UserProfile(user_id=uuid4())
    sparse_case = ImmigrationCase(
        id=uuid4(),
        user_id=uuid4(),
        title="Exploratory migration case",
        status=ImmigrationCaseStatus.DRAFT,
    )

    workspace = service.build(
        profile=sparse_profile,
        immigration_case=sparse_case,
        documents=[],
    )

    assert workspace.health.health_status in {"incomplete", "at_risk"}
    assert workspace.missing_information
    assert workspace.missing_information_grouped.critical
    assert workspace.checklist_summary.missing_required_items >= 1
    assert workspace.next_best_action.priority == "immediate"
