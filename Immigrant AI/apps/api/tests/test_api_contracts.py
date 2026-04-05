from __future__ import annotations

pytest_plugins = ("tests.test_full_stack_abuse_flow",)

from tests.test_full_stack_abuse_flow import _auth_headers


def test_auth_contract_happy_path(flow_client) -> None:
    client, _state = flow_client

    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "contract-auth@example.com",
            "password": "password123",
            "profile": {"first_name": "Ada"},
        },
    )
    assert register_response.status_code == 201
    assert set(register_response.json()) == {
        "id",
        "email",
        "status",
        "plan",
        "created_at",
        "updated_at",
        "profile",
    }

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "contract-auth@example.com", "password": "password123"},
    )
    assert login_response.status_code == 200
    assert set(login_response.json()) == {"access_token", "token_type", "expires_in"}

    me_response = client.get(
        "/api/v1/auth/me",
        headers=_auth_headers(login_response.json()["access_token"]),
    )
    assert me_response.status_code == 200
    assert set(me_response.json()) == {
        "id",
        "email",
        "status",
        "plan",
        "created_at",
        "updated_at",
        "profile",
    }


def test_auth_contract_invalid_payloads(flow_client) -> None:
    client, _state = flow_client

    register_response = client.post(
        "/api/v1/auth/register",
        json={"email": "broken@example.com", "password": "short"},
    )
    assert register_response.status_code == 422

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "broken@example.com", "password": "short"},
    )
    assert login_response.status_code == 422


def test_profile_contract_happy_path(flow_client) -> None:
    client, _state = flow_client
    client.post(
        "/api/v1/auth/register",
        json={"email": "contract-profile@example.com", "password": "password123"},
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "contract-profile@example.com", "password": "password123"},
    )
    headers = _auth_headers(login_response.json()["access_token"])

    get_response = client.get("/api/v1/profile/me", headers=headers)
    assert get_response.status_code == 200
    assert set(get_response.json()) == {
        "id",
        "user_id",
        "first_name",
        "last_name",
        "nationality",
        "current_country",
        "target_country",
        "marital_status",
        "children_count",
        "education_level",
        "english_level",
        "profession",
        "years_of_experience",
        "available_capital",
        "criminal_record_flag",
        "prior_visa_refusal_flag",
        "relocation_timeline",
        "preferred_language",
        "created_at",
        "updated_at",
    }

    put_response = client.put(
        "/api/v1/profile/me",
        headers=headers,
        json={
            "nationality": "Turkish",
            "education_level": "master",
            "english_level": "advanced",
        },
    )
    assert put_response.status_code == 200
    assert put_response.json()["nationality"] == "Turkish"
    assert put_response.json()["education_level"] == "master"


def test_profile_contract_invalid_payloads(flow_client) -> None:
    client, _state = flow_client
    client.post(
        "/api/v1/auth/register",
        json={"email": "contract-profile-invalid@example.com", "password": "password123"},
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "contract-profile-invalid@example.com",
            "password": "password123",
        },
    )
    headers = _auth_headers(login_response.json()["access_token"])

    response = client.put(
        "/api/v1/profile/me",
        headers=headers,
        json={"children_count": -1},
    )
    assert response.status_code == 422


def test_cases_contract_happy_path(flow_client) -> None:
    client, _state = flow_client
    client.post(
        "/api/v1/auth/register",
        json={"email": "contract-cases@example.com", "password": "password123"},
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "contract-cases@example.com", "password": "password123"},
    )
    headers = _auth_headers(login_response.json()["access_token"])

    create_response = client.post(
        "/api/v1/cases",
        headers=headers,
        json={
            "title": "Case Contract",
            "target_country": "United States",
            "target_program": "EB-2 NIW",
            "status": "in_review",
            "latest_score": "78.50",
            "risk_score": "22.00",
        },
    )
    assert create_response.status_code == 201
    assert set(create_response.json()) == {
        "id",
        "user_id",
        "title",
        "target_country",
        "target_program",
        "current_stage",
        "status",
        "notes",
        "latest_score",
        "risk_score",
        "probability_score",
        "probability_confidence",
        "created_at",
        "updated_at",
        "probability_explanation_json",
    }

    case_id = create_response.json()["id"]
    list_response = client.get("/api/v1/cases", headers=headers)
    assert list_response.status_code == 200
    assert isinstance(list_response.json(), list)
    assert list_response.json()[0]["id"] == case_id

    update_response = client.put(
        f"/api/v1/cases/{case_id}",
        headers=headers,
        json={"title": "Case Contract Updated"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["title"] == "Case Contract Updated"


def test_cases_contract_invalid_payloads(flow_client) -> None:
    client, _state = flow_client
    client.post(
        "/api/v1/auth/register",
        json={"email": "contract-cases-invalid@example.com", "password": "password123"},
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "contract-cases-invalid@example.com",
            "password": "password123",
        },
    )
    headers = _auth_headers(login_response.json()["access_token"])

    create_response = client.post(
        "/api/v1/cases",
        headers=headers,
        json={"title": "", "status": "in_review"},
    )
    assert create_response.status_code == 422

    invalid_score_response = client.post(
        "/api/v1/cases",
        headers=headers,
        json={"title": "Bad Case", "status": "in_review", "latest_score": "101"},
    )
    assert invalid_score_response.status_code == 422


def test_documents_contract_happy_path(flow_client) -> None:
    client, _state = flow_client
    client.post(
        "/api/v1/auth/register",
        json={"email": "contract-docs@example.com", "password": "password123"},
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "contract-docs@example.com", "password": "password123"},
    )
    headers = _auth_headers(login_response.json()["access_token"])
    case_response = client.post(
        "/api/v1/cases",
        headers=headers,
        json={"title": "Document Case", "status": "draft"},
    )
    case_id = case_response.json()["id"]

    upload_response = client.post(
        f"/api/v1/cases/{case_id}/documents",
        headers=headers,
        data={"document_type": "passport"},
        files={"file": ("passport.pdf", b"pdf-content", "application/pdf")},
    )
    assert upload_response.status_code == 201
    assert "analysis_metadata" in upload_response.json()

    list_response = client.get(f"/api/v1/cases/{case_id}/documents", headers=headers)
    assert list_response.status_code == 200
    assert isinstance(list_response.json(), list)
    assert "analysis_metadata" in list_response.json()[0]


def test_documents_contract_invalid_payloads(flow_client) -> None:
    client, _state = flow_client
    client.post(
        "/api/v1/auth/register",
        json={"email": "contract-docs-invalid@example.com", "password": "password123"},
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "contract-docs-invalid@example.com",
            "password": "password123",
        },
    )
    headers = _auth_headers(login_response.json()["access_token"])
    case_response = client.post(
        "/api/v1/cases",
        headers=headers,
        json={"title": "Document Case", "status": "draft"},
    )
    case_id = case_response.json()["id"]

    invalid_upload_response = client.post(
        f"/api/v1/cases/{case_id}/documents",
        headers=headers,
        data={"document_type": "passport"},
        files={"file": ("malware.exe", b"binary", "application/x-msdownload")},
    )
    assert invalid_upload_response.status_code == 415
