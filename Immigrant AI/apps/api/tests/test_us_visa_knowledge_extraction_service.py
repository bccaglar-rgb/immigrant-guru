from app.schemas.knowledge import USVisaKnowledgeExtractionRequest
from app.services.knowledge.us_visa_knowledge_extraction_service import (
    USVisaKnowledgeExtractionService,
)


def test_us_visa_knowledge_extraction_builds_catalog_record() -> None:
    response = USVisaKnowledgeExtractionService().extract(
        payload=USVisaKnowledgeExtractionRequest(
            text=(
                "H-1B Specialty Occupations require a specialty occupation job offer, "
                "employer sponsorship, and an approved Labor Condition Application before petition adjudication. "
                "H-1B is generally cap subject and selected cases proceed through a registration process."
            ),
            official_source_urls=[
                "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
            ],
        )
    )

    assert response.visa_code == "H-1B"
    assert response.visa_family == "nonimmigrant"
    assert response.petitioner_required is True
    assert "DOL" in response.pre_step_required
    assert "USCIS" in response.pre_step_required
    assert response.numerical_cap is True
    assert response.lottery_based is True
    assert response.work_authorization is True
    assert response.official_source_urls
