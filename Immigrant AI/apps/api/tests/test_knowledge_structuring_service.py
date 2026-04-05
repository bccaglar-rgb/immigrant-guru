from app.schemas.knowledge import KnowledgeStructuringRequest
from app.services.knowledge_structuring_service import KnowledgeStructuringService


def test_knowledge_structuring_extracts_rules_exceptions_and_visas() -> None:
    response = KnowledgeStructuringService().structure(
        payload=KnowledgeStructuringRequest(
            text=(
                "H-1B specialty occupation petitions generally require a qualifying role "
                "and degree alignment. Cap-exempt employers are not subject to the annual quota. "
                "Applicants must still maintain valid status."
            )
        )
    )

    assert response.topic == "H-1B"
    assert response.related_visas == ["H-1B"]
    assert any("require a qualifying role" in rule for rule in response.key_rules)
    assert any("Cap-exempt employers" in item for item in response.exceptions)
    assert response.summary
