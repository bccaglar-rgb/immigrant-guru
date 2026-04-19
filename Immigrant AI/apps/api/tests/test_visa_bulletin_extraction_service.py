from fastapi import HTTPException

from app.schemas.ai import VisaBulletinBacklogStatus, VisaBulletinExtractionRequest
from app.services.knowledge.visa_bulletin_extraction_service import VisaBulletinExtractionService


def test_visa_bulletin_extraction_extracts_structured_fields() -> None:
    response = VisaBulletinExtractionService().extract(
        payload=VisaBulletinExtractionRequest(
            text=(
                "Employment-Based Preferences EB-2 India 15FEB13 01JAN13 "
                "some bulletin row content"
            )
        )
    )

    assert response.category == "EB-2"
    assert response.country == "India"
    assert response.final_action_date == "15FEB13"
    assert response.filing_date == "01JAN13"
    assert response.backlog_status == VisaBulletinBacklogStatus.DELAYED
    assert response.notes == []


def test_visa_bulletin_extraction_marks_current_when_both_dates_current() -> None:
    response = VisaBulletinExtractionService().extract(
        payload=VisaBulletinExtractionRequest(
            text="EB-1 All Chargeability Areas Except Those Listed C C"
        )
    )

    assert response.backlog_status == VisaBulletinBacklogStatus.CURRENT
    assert "Final action date is current." in response.notes
    assert "Filing date is current." in response.notes


def test_visa_bulletin_extraction_requires_extractable_dates() -> None:
    service = VisaBulletinExtractionService()

    try:
        service.extract(
            payload=VisaBulletinExtractionRequest(
                text="EB-2 India bulletin row without date values"
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 422
        assert "Could not extract both final action and filing dates" in str(exc.detail)
    else:
        raise AssertionError("Expected extraction failure for missing date values.")
