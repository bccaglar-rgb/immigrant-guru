from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_ai_strategy_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/strategy",
        json={
            "case_id": "00000000-0000-0000-0000-000000000001",
            "question": "What is my best route?",
            "context_mode": "case-aware",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_pathway_probability_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/pathway-probability",
        json={"visa_type": "H-1B Specialty Occupation"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_timeline_simulation_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/timeline-simulation",
        json={
            "visa_type": "Express Entry",
            "target_country": "Canada",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_country_comparison_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/country-comparison",
        json={
            "options": [
                {"country": "USA", "visa_type": "H-1B"},
                {"country": "Canada", "visa_type": "Express Entry"},
                {"country": "Germany", "visa_type": "EU Blue Card"},
            ]
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_alternative_strategies_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/alternative-strategies",
        json={"target_country": "Canada"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_action_priority_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/action-priority",
        json={
            "case_id": "00000000-0000-0000-0000-000000000001",
            "missing_information": ["English test score missing."],
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_profile_weaknesses_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/profile-weaknesses",
        json={},
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_document_analysis_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/document-analysis",
        json={
            "document_type": "passport",
            "extracted_text": "Passport No AB1234567 Name Jane Doe Nationality Turkish Date of Birth 1990-05-01",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_ai_feedback_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/feedback",
        json={
            "case_id": "00000000-0000-0000-0000-000000000001",
            "feature": "strategy",
            "rating": "positive",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_admin_ai_feedback_route_requires_authentication() -> None:
    response = client.get("/api/v1/admin/ai/feedback")

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_copilot_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/copilot",
        json={
            "case_id": "00000000-0000-0000-0000-000000000001",
            "previous_messages": [
                {"role": "user", "content": "What are my strongest options?"}
            ],
            "question": "What should I do next to improve my case?",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."
