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


def test_eligibility_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/eligibility",
        json={
            "user_profile": {"education_level": "master"},
            "visa_requirements": {"required_rules": []},
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


def test_timeline_calculator_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/timeline-calculator",
        json={
            "visa_category": "EB-2",
            "country": "India",
            "backlog_data": {"status": "delayed", "backlog_months": 18},
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


def test_risk_detection_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/risk-detection",
        json={
            "user_profile": {
                "available_capital": "12000",
                "years_of_experience": 1,
            }
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_visa_match_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/visa-match",
        json={
            "user_profile": {
                "education_level": "master",
                "years_of_experience": 6,
                "criminal_record_flag": False,
            },
            "visa_requirements": {"required_rules": []},
            "market_context": {
                "quota_pressure": "medium",
                "backlog_level": "medium",
            },
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_final_decision_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/final-decision",
        json={
            "eligibility_result": {
                "eligible": True,
                "missing_requirements": [],
                "disqualifiers_triggered": [],
                "strength_score": 74,
            },
            "match_score": 68,
            "backlog_data": {"status": "delayed", "backlog_months": 12},
            "red_flags": [],
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_visa_bulletin_extract_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/visa-bulletin-extract",
        json={
            "text": "EB-2 India 15FEB13 01JAN13",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_knowledge_structure_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/knowledge-structure",
        json={
            "text": "EB-2 generally requires a qualifying advanced degree, but national interest waivers can alter the filing path.",
        },
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Authentication credentials were not provided."


def test_us_visa_knowledge_extract_route_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/us-visa-knowledge-extract",
        json={
            "text": "H-1B Specialty Occupations require a specialty occupation job offer and employer sponsorship.",
            "official_source_urls": [
                "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations"
            ],
        },
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
