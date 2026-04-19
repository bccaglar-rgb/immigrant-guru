from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.models.enums import (
    DocumentUploadStatus,
    EducationLevel,
    EnglishLevel,
    ImmigrationCaseStatus,
    RelocationTimeline,
)
from app.services.ai.action_roadmap_service import ActionRoadmapService
from app.services.ai.context_assembler_service import ContextAssemblerService
from app.services.documents.document_checklist_service import DocumentChecklistService
from app.services.ai.missing_information_service import MissingInformationService
from app.services.ai.next_best_action_service import NextBestActionService
from app.services.ai.scoring_service import ScoringService


def test_context_assembler_builds_structured_snapshot() -> None:
    service = ContextAssemblerService(
        action_roadmap_service=ActionRoadmapService(),
        checklist_service=DocumentChecklistService(),
        document_service=SimpleNamespace(),
        missing_information_service=MissingInformationService(),
        next_best_action_service=NextBestActionService(),
        scoring_service=ScoringService(),
    )
    profile = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        first_name=None,
        last_name=None,
        nationality="Turkish",
        current_country="Turkey",
        target_country="Canada",
        marital_status=None,
        children_count=0,
        education_level=EducationLevel.BACHELOR,
        english_level=EnglishLevel.ADVANCED,
        profession="Software Engineer",
        years_of_experience=7,
        available_capital=Decimal("50000.00"),
        criminal_record_flag=False,
        prior_visa_refusal_flag=False,
        relocation_timeline=RelocationTimeline.WITHIN_6_MONTHS,
        preferred_language="en",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )
    immigration_case = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        title="Canada skilled migration",
        target_country="Canada",
        target_program="Express Entry",
        current_stage="eligibility_review",
        status=ImmigrationCaseStatus.IN_REVIEW,
        notes="Need stronger language evidence.",
        latest_score=Decimal("74.00"),
        risk_score=Decimal("28.00"),
        probability_score=Decimal("67.00"),
        probability_confidence="MEDIUM",
        probability_explanation_json={},
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )
    documents = [
        SimpleNamespace(
            id=uuid4(),
            original_filename="passport.pdf",
            document_type="passport",
            upload_status=DocumentUploadStatus.UPLOADED,
            created_at=SimpleNamespace(isoformat=lambda: "2026-01-01T00:00:00Z"),
        )
    ]

    snapshot = service._build_snapshot(  # noqa: SLF001
        profile=profile,
        immigration_case=immigration_case,
        documents=documents,
    )

    assert snapshot.score_summary["overall_score"] >= 0
    assert snapshot.missing_information["critical"] == []
    assert snapshot.recent_documents_summary["recent_documents"][0]["original_filename"] == "passport.pdf"
    assert snapshot.previous_ai_strategy["available"] is False
    assert snapshot.next_best_action["title"]
