from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException, Request, status
from fastapi.testclient import TestClient

from app.api.routes import ai as ai_routes
from app.domains.admin import ai_feedback as ai_feedback_routes
from app.domains.auth import router as auth_routes
from app.api.routes import cases as case_routes
from app.domains.admin import case_outcomes as case_outcome_routes
from app.api.routes import comparison as comparison_routes
from app.domains.profile import router as profile_routes
from app.core.security import get_current_user
from app.db.session import get_db_session
from app.main import app
from app.models.enums import (
    AIFeedbackRating,
    AIFeature,
    CaseOutcomeStatus,
    CopilotMessageRole,
    DocumentUploadStatus,
    EducationLevel,
    EnglishLevel,
    ImmigrationCaseStatus,
    MaritalStatus,
    PathwayProbabilityConfidenceLevel,
    RelocationTimeline,
    UserStatus,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _risk_level(score: float) -> float:
    return round(max(0.0, min(100.0, 100.0 - score)), 2)


def _confidence_from_score(score: float) -> PathwayProbabilityConfidenceLevel:
    if score >= 75:
        return PathwayProbabilityConfidenceLevel.HIGH
    if score >= 55:
        return PathwayProbabilityConfidenceLevel.MEDIUM
    return PathwayProbabilityConfidenceLevel.LOW


def _score_profile(profile: SimpleNamespace, immigration_case: SimpleNamespace) -> float:
    score = 35.0

    if profile.education_level in {EducationLevel.BACHELOR, EducationLevel.MASTER, EducationLevel.DOCTORATE}:
        score += 12.0
    if profile.english_level in {EnglishLevel.ADVANCED, EnglishLevel.FLUENT, EnglishLevel.NATIVE}:
        score += 12.0
    if profile.years_of_experience:
        score += min(float(profile.years_of_experience) * 1.5, 18.0)
    if profile.available_capital:
        score += min(float(profile.available_capital) / 10000.0, 12.0)
    if immigration_case.target_country:
        score += 4.0
    if immigration_case.target_program:
        score += 5.0
    if immigration_case.current_stage:
        score += 3.0
    if immigration_case.notes:
        score += 2.0
    if profile.prior_visa_refusal_flag:
        score -= 10.0
    if profile.criminal_record_flag:
        score -= 25.0

    return round(max(0.0, min(100.0, score)), 2)


def _build_score_payload(case_id: UUID, profile: SimpleNamespace, immigration_case: SimpleNamespace) -> dict:
    overall = _score_profile(profile, immigration_case)
    generated_at = _now().isoformat()
    return {
        "case_id": str(case_id),
        "scoring_version": "v1",
        "disclaimer": "This is a product guidance score, not a legal determination.",
        "overall_score": overall,
        "profile_completeness": {
            "score": min(overall + 4, 100),
            "weight": 0.3,
            "summary": "Core profile inputs are mostly present.",
            "contributions": [
                {
                    "label": "Profile coverage",
                    "points": min(overall + 4, 100),
                    "impact": "positive",
                    "explanation": "Primary immigration profile signals are available."
                }
            ],
        },
        "financial_readiness": {
            "score": min(max(float(profile.available_capital or 0) / 1000.0, 10.0), 100.0),
            "weight": 0.2,
            "summary": "Capital strength affects preparation flexibility.",
            "contributions": [],
        },
        "professional_strength": {
            "score": min(overall + 6, 100),
            "weight": 0.25,
            "summary": "Education, experience, and English support competitiveness.",
            "contributions": [],
        },
        "case_readiness": {
            "score": min(overall - 2, 100),
            "weight": 0.25,
            "summary": "Case structure is usable but still evolving.",
            "contributions": [],
        },
        "overall_reasons": [
            "Education, language, and experience create a workable baseline.",
            "Clearer pathway and stronger evidence can still improve this case."
        ],
        "generated_at": generated_at,
    }


def _build_probability_payload(case_id: UUID, profile: SimpleNamespace, immigration_case: SimpleNamespace) -> dict:
    probability = round(_score_profile(profile, immigration_case) - 4.0, 2)
    confidence = _confidence_from_score(probability)
    generated_at = _now().isoformat()
    return {
        "case_id": str(case_id),
        "target_country": immigration_case.target_country,
        "target_program": immigration_case.target_program,
        "scoring_version": "deterministic_v1",
        "disclaimer": "This is a deterministic product probability estimate for planning support. It is not legal advice or an approval guarantee.",
        "probability_score": probability,
        "confidence_level": confidence,
        "strengths": [
            "Professional profile depth supports pathway competitiveness.",
            "A target country is already defined."
        ],
        "weaknesses": [] if immigration_case.target_program else ["The target pathway is not yet defined."],
        "key_risk_factors": [
            "Prior refusal history or evidence gaps can reduce confidence."
        ] if profile.prior_visa_refusal_flag or not immigration_case.notes else [],
        "improvement_actions": [
            "Define the strongest pathway and align document collection.",
            "Close the highest-impact profile gaps first."
        ],
        "reasoning_summary": "This is a planning-oriented probability estimate built from current profile and case strength.",
        "generated_at": generated_at,
    }


def _build_timeline_payload(case_id: UUID, immigration_case: SimpleNamespace) -> dict:
    total_months = 10.0 if immigration_case.target_program else 13.5
    generated_at = _now().isoformat()
    return {
        "case_id": str(case_id),
        "target_country": immigration_case.target_country,
        "target_program": immigration_case.target_program,
        "timeline_version": "deterministic_v1",
        "disclaimer": "This is a deterministic planning timeline estimate. It supports preparation decisions and does not guarantee government processing times.",
        "total_estimated_duration_months": total_months,
        "steps": [
            {
                "step_name": "Profile and evidence preparation",
                "estimated_duration_months": 2.0,
                "description": "Close missing information and align documents to the selected pathway."
            },
            {
                "step_name": "Filing readiness and submission",
                "estimated_duration_months": 3.0,
                "description": "Prepare filing materials and submit the strongest pathway package."
            },
            {
                "step_name": "Processing and decision",
                "estimated_duration_months": max(total_months - 5.0, 1.0),
                "description": "Agency review, requests, and final decision period."
            },
        ],
        "delay_risks": ["Missing evidence can extend preparation time."],
        "acceleration_tips": ["Define the target pathway early and upload core identity and work evidence first."],
        "generated_at": generated_at,
    }


@dataclass
class InMemoryState:
    users: dict[UUID, SimpleNamespace] = field(default_factory=dict)
    email_to_user_id: dict[str, UUID] = field(default_factory=dict)
    tokens: dict[str, UUID] = field(default_factory=dict)
    cases: dict[UUID, SimpleNamespace] = field(default_factory=dict)
    documents_by_case: dict[UUID, list[SimpleNamespace]] = field(default_factory=dict)
    threads_by_case: dict[UUID, SimpleNamespace] = field(default_factory=dict)
    case_outcomes_by_case: dict[UUID, SimpleNamespace] = field(default_factory=dict)
    ai_feedback_entries: list[SimpleNamespace] = field(default_factory=list)

    def create_profile(self, user_id: UUID, **overrides) -> SimpleNamespace:
        timestamp = _now()
        return SimpleNamespace(
            id=uuid4(),
            user_id=user_id,
            first_name=overrides.get("first_name"),
            last_name=overrides.get("last_name"),
            nationality=overrides.get("nationality"),
            current_country=overrides.get("current_country"),
            target_country=overrides.get("target_country"),
            marital_status=overrides.get("marital_status"),
            children_count=overrides.get("children_count"),
            education_level=overrides.get("education_level"),
            english_level=overrides.get("english_level"),
            profession=overrides.get("profession"),
            years_of_experience=overrides.get("years_of_experience"),
            available_capital=overrides.get("available_capital"),
            criminal_record_flag=overrides.get("criminal_record_flag"),
            prior_visa_refusal_flag=overrides.get("prior_visa_refusal_flag"),
            relocation_timeline=overrides.get("relocation_timeline"),
            preferred_language=overrides.get("preferred_language"),
            created_at=timestamp,
            updated_at=timestamp,
        )

    def create_user(self, *, email: str, password: str, profile_payload: dict | None) -> SimpleNamespace:
        normalized_email = email.strip().lower()
        if normalized_email in self.email_to_user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )

        user_id = uuid4()
        timestamp = _now()
        profile = self.create_profile(user_id, **(profile_payload or {}))
        user = SimpleNamespace(
            id=user_id,
            email=normalized_email,
            password=password,
            status=UserStatus.ACTIVE,
            created_at=timestamp,
            updated_at=timestamp,
            profile=profile,
            immigration_cases=[],
        )
        self.users[user_id] = user
        self.email_to_user_id[normalized_email] = user_id
        return user

    def issue_token(self, user_id: UUID) -> tuple[str, int]:
        token = f"test-token-{user_id}"
        self.tokens[token] = user_id
        return token, 1800

    def get_user_by_token(self, token: str) -> SimpleNamespace | None:
        user_id = self.tokens.get(token)
        if user_id is None:
            return None
        return self.users.get(user_id)

    def get_user_by_email(self, email: str) -> SimpleNamespace | None:
        user_id = self.email_to_user_id.get(email.strip().lower())
        if user_id is None:
            return None
        return self.users.get(user_id)

    def require_case(self, case_id: UUID, user_id: UUID) -> SimpleNamespace:
        immigration_case = self.cases.get(case_id)
        if immigration_case is None or immigration_case.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Immigration case not found.",
            )
        return immigration_case


class DummyAsyncSession:
    pass


class FakeAuthService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def register_user(self, session, payload):
        del session
        return self._state.create_user(
            email=payload.email,
            password=payload.password,
            profile_payload=payload.profile.model_dump() if payload.profile else None,
        )

    async def login(self, session, payload):
        del session
        user = self._state.get_user_by_email(payload.email)
        if user is None or user.password != payload.password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token, expires_in = self._state.issue_token(user.id)
        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": expires_in,
        }


class FakeProfileService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def get_or_create_profile(self, session, user):
        del session
        return self._state.users[user.id].profile

    async def update_profile(self, session, user, payload):
        del session
        profile = self._state.users[user.id].profile
        for field_name, value in payload.model_dump(exclude_unset=True).items():
            setattr(profile, field_name, value)
        profile.updated_at = _now()
        self._state.users[user.id].updated_at = profile.updated_at
        return profile


class FakeCaseService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def create_case(self, session, user, payload):
        del session
        timestamp = _now()
        immigration_case = SimpleNamespace(
            id=uuid4(),
            user_id=user.id,
            title=payload.title,
            target_country=payload.target_country,
            target_program=payload.target_program,
            current_stage=payload.current_stage,
            status=payload.status,
            notes=payload.notes,
            latest_score=payload.latest_score,
            risk_score=payload.risk_score,
            probability_score=None,
            probability_confidence=None,
            probability_explanation_json={},
            created_at=timestamp,
            updated_at=timestamp,
        )
        self._state.cases[immigration_case.id] = immigration_case
        self._state.users[user.id].immigration_cases.append(immigration_case)
        self._state.documents_by_case.setdefault(immigration_case.id, [])
        return immigration_case

    async def list_cases(self, session, user):
        del session
        return sorted(
            [case for case in self._state.cases.values() if case.user_id == user.id],
            key=lambda case: case.updated_at,
            reverse=True,
        )

    async def get_case(self, session, user, case_id):
        del session
        return self._state.require_case(case_id, user.id)

    async def update_case(self, session, user, case_id, payload):
        del session
        immigration_case = self._state.require_case(case_id, user.id)
        updates = payload.model_dump(exclude_unset=True)
        for field_name, value in updates.items():
            setattr(immigration_case, field_name, value)
        immigration_case.updated_at = _now()
        return immigration_case

    async def delete_case(self, session, user, case_id):
        del session
        immigration_case = self._state.require_case(case_id, user.id)
        del self._state.cases[case_id]
        self._state.documents_by_case.pop(case_id, None)
        self._state.threads_by_case.pop(case_id, None)
        self._state.users[user.id].immigration_cases = [
            item for item in self._state.users[user.id].immigration_cases if item.id != case_id
        ]
        return immigration_case


class FakeScoringService:
    def score_case(self, *, profile, immigration_case):
        return _build_score_payload(immigration_case.id, profile, immigration_case)


class FakePathwayProbabilityService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def evaluate_case(self, session, user, case_id):
        del session
        immigration_case = self._state.require_case(case_id, user.id)
        profile = self._state.users[user.id].profile
        return _build_probability_payload(case_id, profile, immigration_case)


class FakeTimelineSimulationService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def simulate_case(self, session, user, case_id):
        del session
        immigration_case = self._state.require_case(case_id, user.id)
        return _build_timeline_payload(case_id, immigration_case)


class FakeDocumentService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def upload_case_document(self, *, session, user, case_id, upload_file, document_type):
        del session
        self._state.require_case(case_id, user.id)
        content = await upload_file.read()
        if upload_file.content_type not in {"application/pdf", "image/jpeg", "image/png"}:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unsupported file type.",
            )
        if len(content) > 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Uploaded file exceeds the maximum allowed size.",
            )

        timestamp = _now()
        document = SimpleNamespace(
            id=uuid4(),
            case_id=case_id,
            filename=f"{uuid4().hex}_{upload_file.filename}",
            original_filename=upload_file.filename,
            mime_type=upload_file.content_type,
            size=len(content),
            storage_path=f"documents/{case_id}/{upload_file.filename}",
            upload_status=DocumentUploadStatus.UPLOADED,
            document_type=document_type,
            processing_attempts=1,
            processed_at=timestamp,
            processing_error=None,
            analysis_metadata={
                "intelligence": {
                    "document_classification": {
                        "document_type": document_type or "passport",
                        "summary": "The document appears relevant to the case."
                    },
                    "issues_detected": [],
                    "missing_required_information": [],
                    "improvement_suggestions": ["Keep the scan clear and complete."],
                    "relevance_to_pathway": {
                        "score": 86.0,
                        "pathway_alignment": "high",
                    },
                    "completeness": {
                        "score": 82.0,
                        "summary": "The document appears materially usable."
                    },
                }
            },
            created_at=timestamp,
            updated_at=timestamp,
        )
        self._state.documents_by_case.setdefault(case_id, []).append(document)
        return document

    async def list_case_documents(self, *, session, user, case_id):
        del session
        self._state.require_case(case_id, user.id)
        return list(self._state.documents_by_case.get(case_id, []))


class FakeWorkspaceService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def build_case_workspace(self, *, session, user, case_id):
        del session
        immigration_case = self._state.require_case(case_id, user.id)
        profile = self._state.users[user.id].profile
        documents = self._state.documents_by_case.get(case_id, [])
        score = _build_score_payload(case_id, profile, immigration_case)
        probability = _build_probability_payload(case_id, profile, immigration_case)
        timeline = _build_timeline_payload(case_id, immigration_case)
        missing_critical = []
        if not immigration_case.target_program:
            missing_critical.append("Target pathway is still missing.")
        if not profile.profession:
            missing_critical.append("Profession is missing.")
        health_score = round((score["overall_score"] + probability["probability_score"]) / 2.0, 2)
        health_status = "strong" if health_score >= 75 else "needs_attention" if health_score >= 55 else "incomplete"

        checklist = [
            {
                "id": "passport",
                "document_name": "Passport",
                "category": "identity",
                "requirement_level": "required",
                "status": "uploaded" if documents else "missing",
                "notes": "Primary identity document.",
                "matched_document_id": str(documents[0].id) if documents else None,
            }
        ]

        return {
            "case_id": str(case_id),
            "generated_at": _now().isoformat(),
            "readiness_score": {
                "overall_score": score["overall_score"],
                "label": "On track" if score["overall_score"] >= 70 else "Developing",
                "summary": "The case is usable for planning but still has evidence gaps.",
                "profile_completeness_score": score["profile_completeness"]["score"],
                "financial_readiness_score": score["financial_readiness"]["score"],
                "professional_strength_score": score["professional_strength"]["score"],
                "case_readiness_score": score["case_readiness"]["score"],
            },
            "probability_summary": {
                "probability_score": probability["probability_score"],
                "confidence_level": probability["confidence_level"],
                "summary": probability["reasoning_summary"],
                "strengths": probability["strengths"],
                "weaknesses": probability["weaknesses"],
            },
            "timeline_summary": {
                "total_estimated_duration_months": timeline["total_estimated_duration_months"],
                "next_step": timeline["steps"][0]["step_name"],
                "next_step_duration_months": timeline["steps"][0]["estimated_duration_months"],
                "delay_risks": timeline["delay_risks"],
                "acceleration_tips": timeline["acceleration_tips"],
            },
            "top_risks": [
                {
                    "id": "risk_1",
                    "title": "Pathway clarity risk",
                    "severity": "high" if not immigration_case.target_program else "medium",
                    "source": "probability",
                    "description": "The target program definition materially affects downstream execution."
                }
            ],
            "missing_information": [
                {
                    "id": f"missing_{index}",
                    "severity": "critical",
                    "source": "profile" if "Profession" in message else "case",
                    "message": message,
                }
                for index, message in enumerate(missing_critical, start=1)
            ],
            "next_best_action": {
                "title": "Define the strongest case path" if not immigration_case.target_program else "Upload core evidence",
                "reasoning": "This is the highest leverage move to improve confidence and execution speed.",
                "priority": "immediate",
                "timing_category": "now",
            },
            "document_status_summary": {
                "total_items": 1,
                "required_items": 1,
                "completed_items": 1 if documents else 0,
                "uploaded_items": 1 if documents else 0,
                "processing_items": 0,
                "failed_items": 0,
                "missing_required_items": 0 if documents else 1,
                "readiness_score": 100.0 if documents else 0.0,
                "attention_required": not bool(documents),
                "summary": "Core document coverage is in progress." if not documents else "Core document coverage is present.",
            },
            "recommended_pathway": {
                "target_country": immigration_case.target_country,
                "pathway": immigration_case.target_program,
                "confidence_level": probability["confidence_level"],
                "rationale": "The selected pathway remains the strongest anchor for the current case."
            },
            "case_health": {
                "health_status": health_status,
                "health_score": health_score,
                "issues": missing_critical,
                "recommended_next_focus": "Close missing information and maintain current evidence."
            },
            "action_roadmap": [
                {
                    "id": "roadmap_1",
                    "title": "Confirm pathway and evidence map",
                    "description": "Lock the primary strategy and align the evidence list.",
                    "priority": "immediate",
                    "timing_category": "this_week",
                    "dependency_notes": None,
                }
            ],
            "health": {
                "health_status": health_status,
                "health_score": health_score,
                "issues": missing_critical,
                "recommended_next_focus": "Close missing information and maintain current evidence."
            },
            "missing_information_grouped": {
                "critical": missing_critical,
                "helpful": [] if immigration_case.notes else ["Add richer case notes for better downstream guidance."],
            },
            "checklist_summary": {
                "total_items": 1,
                "required_items": 1,
                "completed_items": 1 if documents else 0,
                "uploaded_items": 1 if documents else 0,
                "processing_items": 0,
                "failed_items": 0,
                "missing_required_items": 0 if documents else 1,
                "readiness_score": 100.0 if documents else 0.0,
            },
            "checklist": checklist,
            "roadmap": [
                {
                    "id": "roadmap_1",
                    "title": "Confirm pathway and evidence map",
                    "description": "Lock the primary strategy and align the evidence list.",
                    "priority": "immediate",
                    "timing_category": "this_week",
                    "dependency_notes": None,
                }
            ],
        }


class FakeScenarioSimulationService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def simulate_case(self, *, session, user, case_id, payload):
        del session
        immigration_case = self._state.require_case(case_id, user.id)
        profile = self._state.users[user.id].profile
        current_score = _score_profile(profile, immigration_case)
        simulated_score = current_score

        if payload.profile_overrides.english_level in {EnglishLevel.ADVANCED, EnglishLevel.FLUENT}:
            simulated_score += 8.0
        if payload.profile_overrides.education_level in {EducationLevel.MASTER, EducationLevel.DOCTORATE}:
            simulated_score += 5.0
        if payload.profile_overrides.available_capital:
            simulated_score += min(float(payload.profile_overrides.available_capital) / 20000.0, 5.0)
        if payload.profile_overrides.years_of_experience:
            simulated_score += min(float(payload.profile_overrides.years_of_experience) / 2.0, 4.0)

        simulated_score = round(max(0.0, min(100.0, simulated_score)), 2)
        current_probability = round(max(0.0, current_score - 4.0), 2)
        simulated_probability = round(max(0.0, simulated_score - 2.0), 2)

        current_timeline = 12.0
        simulated_timeline = 10.5 if simulated_probability > current_probability else 12.0

        return {
            "case_id": str(case_id),
            "disclaimer": "This is a planning simulation for product guidance. It is not legal advice or an approval guarantee.",
            "current": {
                "readiness_score": current_score,
                "probability_score": current_probability,
                "timeline_months": current_timeline,
                "confidence_level": _confidence_from_score(current_probability),
                "summary": "Current state reflects the existing case baseline."
            },
            "simulated": {
                "readiness_score": simulated_score,
                "probability_score": simulated_probability,
                "timeline_months": simulated_timeline,
                "confidence_level": _confidence_from_score(simulated_probability),
                "summary": "Simulated state improves the case planning position."
            },
            "delta": {
                "readiness_score_change": round(simulated_score - current_score, 2),
                "probability_score_change": round(simulated_probability - current_probability, 2),
                "timeline_months_change": round(simulated_timeline - current_timeline, 2),
            },
            "impact_summary": [
                {
                    "id": "impact_1",
                    "summary": "The proposed changes improve pathway competitiveness.",
                    "tone": "positive",
                }
            ],
            "recommended_improvements": [
                {
                    "id": "improvement_1",
                    "title": "Prioritize language and evidence strength",
                    "detail": "Higher English and stronger documented credentials usually improve ranking first.",
                    "impact_label": "High impact",
                }
            ],
            "generated_at": _now().isoformat(),
        }


class FakeCaseOutcomeService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def get_case_outcome(self, *, session, user, case_id):
        del session
        self._state.require_case(case_id, user.id)
        outcome = self._state.case_outcomes_by_case.get(case_id)
        if outcome is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Case outcome has not been recorded yet.",
            )
        return outcome

    async def create_case_outcome(self, *, session, user, case_id, payload):
        del session
        self._state.require_case(case_id, user.id)
        if case_id in self._state.case_outcomes_by_case:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Case outcome has already been recorded.",
            )
        timestamp = _now()
        outcome = SimpleNamespace(
            id=uuid4(),
            case_id=case_id,
            outcome=payload.outcome,
            duration_months=payload.duration_months,
            final_pathway=payload.final_pathway,
            decision_date=payload.decision_date,
            notes=payload.notes,
            recorded_by_user_id=user.id,
            recorded_at=timestamp,
            created_at=timestamp,
            updated_at=timestamp,
        )
        self._state.case_outcomes_by_case[case_id] = outcome
        return outcome

    async def update_case_outcome(self, *, session, user, case_id, payload):
        del session
        outcome = await self.get_case_outcome(session=None, user=user, case_id=case_id)
        updates = payload.model_dump(exclude_unset=True)
        for field_name, value in updates.items():
            setattr(outcome, field_name, value)
        outcome.recorded_by_user_id = user.id
        outcome.recorded_at = _now()
        outcome.updated_at = _now()
        return outcome

    async def summarize_outcomes(self, *, session):
        del session
        outcomes = list(self._state.case_outcomes_by_case.values())
        by_outcome: dict[str, int] = {}
        by_pathway: dict[str, int] = {}
        duration_sum = 0
        duration_count = 0
        for outcome in outcomes:
            key = outcome.outcome.value if hasattr(outcome.outcome, "value") else str(outcome.outcome)
            by_outcome[key] = by_outcome.get(key, 0) + 1
            pathway = outcome.final_pathway or "unspecified"
            by_pathway[pathway] = by_pathway.get(pathway, 0) + 1
            if outcome.duration_months is not None:
                duration_sum += int(outcome.duration_months)
                duration_count += 1
        return {
            "total_cases_with_outcomes": len(outcomes),
            "by_outcome": by_outcome,
            "by_pathway": by_pathway,
            "average_duration_months": round(duration_sum / duration_count, 1)
            if duration_count
            else None,
            "generated_at": _now().isoformat(),
        }


class FakeAIFeedbackService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def submit_feedback(self, *, session, user, payload):
        del session
        self._state.require_case(payload.case_id, user.id)
        feedback = SimpleNamespace(
            id=uuid4(),
            user_id=user.id,
            case_id=payload.case_id,
            feature=payload.feature,
            rating=payload.rating,
            comment=payload.comment,
            target_id=payload.target_id,
            created_at=_now(),
            updated_at=_now(),
        )
        self._state.ai_feedback_entries.append(feedback)
        return feedback

    async def summarize_feedback(self, *, session, limit):
        del session
        feedback_entries = list(reversed(self._state.ai_feedback_entries))
        recent = feedback_entries[:limit]
        by_feature: dict[str, int] = {}
        positive = 0
        negative = 0
        for entry in self._state.ai_feedback_entries:
            feature = entry.feature.value if hasattr(entry.feature, "value") else str(entry.feature)
            by_feature[feature] = by_feature.get(feature, 0) + 1
            if entry.rating == AIFeedbackRating.POSITIVE:
                positive += 1
            else:
                negative += 1
        return {
            "total_feedback": len(self._state.ai_feedback_entries),
            "positive_feedback": positive,
            "negative_feedback": negative,
            "by_feature": by_feature,
            "recent_feedback": recent,
            "generated_at": _now().isoformat(),
        }


class FakeCopilotChatService:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    def _get_or_create_thread(self, *, user_id: UUID, case_id: UUID) -> SimpleNamespace:
        existing = self._state.threads_by_case.get(case_id)
        if existing is not None:
            if existing.user_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Immigration case not found.",
                )
            return existing

        timestamp = _now()
        thread = SimpleNamespace(
            id=uuid4(),
            case_id=case_id,
            user_id=user_id,
            created_at=timestamp,
            updated_at=timestamp,
            messages=[],
        )
        self._state.threads_by_case[case_id] = thread
        return thread

    async def get_or_create_thread(self, *, session, user, case_id):
        del session
        self._state.require_case(case_id, user.id)
        return self._get_or_create_thread(user_id=user.id, case_id=case_id)

    async def post_user_message(self, *, session, user, case_id, payload):
        del session
        self._state.require_case(case_id, user.id)
        thread = self._get_or_create_thread(user_id=user.id, case_id=case_id)
        timestamp = _now()
        user_message = SimpleNamespace(
            id=uuid4(),
            thread_id=thread.id,
            case_id=case_id,
            user_id=user.id,
            role=CopilotMessageRole.USER,
            content=payload.content,
            metadata_json={"source": "case_copilot"},
            created_at=timestamp,
        )
        assistant_message = SimpleNamespace(
            id=uuid4(),
            thread_id=thread.id,
            case_id=case_id,
            user_id=user.id,
            role=CopilotMessageRole.ASSISTANT,
            content="Focus on the highest-impact missing evidence before asking for a new plan.",
            metadata_json={
                "suggested_actions": ["Upload core identity and experience evidence."],
                "related_risks": ["Undefined pathway details keep confidence lower."],
            },
            created_at=_now(),
        )
        thread.messages.extend([user_message, assistant_message])
        thread.updated_at = _now()
        return {
            "thread": thread,
            "user_message": user_message,
            "assistant_message": assistant_message,
        }


class FakeAIOrchestrator:
    def __init__(self, state: InMemoryState) -> None:
        self._state = state

    async def generate_strategy(self, *, session, user, payload):
        del session
        immigration_case = self._state.require_case(payload.case_id, user.id)
        if "force-failure" in payload.question.lower():
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI strategy generation failed.",
            )
        return {
            "case_id": str(payload.case_id),
            "context_mode": payload.context_mode,
            "provider": "test-ai",
            "model": "test-model",
            "generated_at": _now().isoformat(),
            "grounding_used": False,
            "grounding_backend": None,
            "sources_used": [],
            "summary": "A work-based route remains strongest based on the current profile and case context.",
            "plans": [
                {
                    "label": "Plan A",
                    "pathway_name": immigration_case.target_program or "Primary pathway",
                    "why_it_may_fit": "The profile and case data align best with the leading skilled route.",
                    "major_risks": ["Evidence gaps can still reduce approval strength."],
                    "estimated_complexity": "medium",
                    "estimated_timeline_category": "medium_term",
                    "estimated_cost_category": "medium",
                    "suitability_score": 78,
                    "next_action": "Close the highest-impact information and document gaps first."
                },
                {
                    "label": "Plan B",
                    "pathway_name": "Alternative skilled route",
                    "why_it_may_fit": "This remains viable if the primary route weakens.",
                    "major_risks": ["Comparative competitiveness may be lower."],
                    "estimated_complexity": "medium",
                    "estimated_timeline_category": "long_term",
                    "estimated_cost_category": "medium",
                    "suitability_score": 64,
                    "next_action": "Keep this path as a fallback while strengthening the primary case."
                }
            ],
            "missing_information": ["Detailed evidence mapping is still incomplete."],
            "missing_information_by_severity": {
                "critical": ["Profession evidence map is incomplete."],
                "helpful": ["More detailed case notes would improve context."]
            },
            "next_steps": ["Upload strong supporting documents.", "Refine the target pathway."],
            "confidence_label": "medium",
            "confidence_score": 67.0,
            "confidence_reasons": ["The profile is materially usable.", "Some critical evidence is still missing."],
        }


class FakeAIProbabilityService:
    async def evaluate(self, *, session, user, payload):
        del session, user
        return {
            "probability_score": 68,
            "confidence_level": "MEDIUM",
            "strengths": ["Professional experience aligns with the pathway."],
            "weaknesses": ["Supporting evidence can still be strengthened."],
            "key_risk_factors": ["Documentation depth remains important."],
            "improvement_actions": ["Improve evidence alignment to the pathway."],
            "reasoning_summary": f"{payload.visa_type} is plausible for the current profile, but not yet high-certainty."
        }


class FakeAITimelineService:
    async def simulate(self, *, session, user, payload):
        del session, user
        return {
            "total_estimated_duration_months": 13.0,
            "steps": [
                {
                    "step_name": "Preparation",
                    "estimated_duration_months": 3.0,
                    "description": "Prepare documents and profile evidence."
                },
                {
                    "step_name": "Processing",
                    "estimated_duration_months": 10.0,
                    "description": "Agency processing and decision."
                }
            ],
            "delay_risks": [f"Missing evidence can delay {payload.visa_type} preparation."],
            "acceleration_tips": ["Prepare supporting evidence before filing."],
        }


class FakeAICountryComparisonService:
    async def compare(self, *, session, user, payload):
        del session, user
        first = payload.options[0]
        return {
            "comparison": [
                {
                    "country": option.country,
                    "pathway": option.visa_type,
                    "success_probability": 72 if index == 0 else 61,
                    "estimated_time_months": 12.0 + index,
                    "cost_level": "MEDIUM",
                    "difficulty": "MEDIUM",
                    "key_advantages": [f"{option.country} offers a workable structured route."],
                    "key_disadvantages": [f"{option.country} still requires strong evidence quality."],
                }
                for index, option in enumerate(payload.options)
            ],
            "best_option": f"{first.country} - {first.visa_type}",
            "reasoning": "The leading option balances success probability and execution burden best.",
        }


class FakeAlternativeStrategiesService:
    async def generate(self, *, session, user, payload):
        del session, user
        return {
            "plans": [
                {
                    "name": "Plan A",
                    "pathway": f"{payload.target_country} primary route",
                    "why_it_fits": "This path best matches the current case strengths.",
                    "probability": 76,
                    "timeline_months": 12.0,
                    "cost_estimate": "Medium",
                    "risks": ["Evidence quality remains important."],
                    "next_steps": ["Align documents to the primary route."],
                },
                {
                    "name": "Plan B",
                    "pathway": f"{payload.target_country} fallback route",
                    "why_it_fits": "This route remains useful if the primary path weakens.",
                    "probability": 64,
                    "timeline_months": 15.0,
                    "cost_estimate": "Medium",
                    "risks": ["Longer preparation time."],
                    "next_steps": ["Keep fallback documents organized."],
                },
                {
                    "name": "Plan C",
                    "pathway": f"{payload.target_country} long-term route",
                    "why_it_fits": "This path becomes more realistic after stronger long-term positioning.",
                    "probability": 52,
                    "timeline_months": 24.0,
                    "cost_estimate": "Medium",
                    "risks": ["Requires longer evidence-building runway."],
                    "next_steps": ["Strengthen profile depth for the long-term path."],
                }
            ],
            "recommended_plan": "Plan A",
            "confidence_score": 74,
        }


class FakeActionPrioritizationService:
    async def prioritize(self, *, session, user, payload):
        del session, user
        return {
            "next_best_action": "Resolve the highest-priority missing evidence item.",
            "why_this_matters": "Closing the biggest gap improves both strategy quality and execution confidence.",
            "impact_level": "HIGH",
            "urgency": "HIGH",
        }


class FakeProfileWeaknessService:
    async def analyze(self, *, session, user, payload):
        del session, payload
        weaknesses = []
        if not user.profile.profession:
            weaknesses.append(
                {
                    "area": "Professional evidence",
                    "severity": "HIGH",
                    "why_it_matters": "Professional clarity is core to skilled migration planning.",
                    "how_to_improve": ["Define profession and supporting work evidence."],
                }
            )
        else:
            weaknesses.append(
                {
                    "area": "Language evidence",
                    "severity": "MEDIUM",
                    "why_it_matters": "Language strength often affects competitiveness and pathway ranking.",
                    "how_to_improve": ["Strengthen language evidence or score strategy."],
                }
            )
        return {
            "weaknesses": weaknesses,
            "priority_focus": "Resolve the most material evidence gap first.",
        }


class FakeDocumentAnalysisService:
    async def analyze(self, *, payload):
        return {
            "document_classification": payload.document_type,
            "key_information": ["Identity details appear present."],
            "issues_detected": [] if "passport" in payload.document_type.lower() else ["Document type confidence is limited."],
            "missing_information": ["Expiry date not clearly confirmed."],
            "improvement_suggestions": ["Upload a clearer scan if any fields are blurred."],
        }


class FakeCopilotService:
    async def respond(self, *, session, user, payload):
        del session, user
        return {
            "answer": f"Focus next on the highest-impact step for case {payload.case_id}.",
            "suggested_actions": ["Upload missing core documents.", "Clarify the target pathway."],
            "related_risks": ["Leaving the evidence gap open keeps confidence lower."],
        }


class FakeComparisonService:
    async def compare(self, *, session, user, payload):
        del session, user
        first = payload.options[0]
        return {
            "comparison": [
                {
                    "country": option.country,
                    "pathway": option.pathway,
                    "success_probability": 71.0 if index == 0 else 63.0,
                    "estimated_time_months": 12.0 + index,
                    "cost_level": "MEDIUM",
                    "difficulty": "MEDIUM",
                    "key_advantages": [f"{option.country} is comparatively structured for this profile."],
                    "key_disadvantages": [f"{option.country} still demands strong evidence quality."],
                }
                for index, option in enumerate(payload.options)
            ],
            "best_option": f"{first.country} - {first.pathway}",
            "reasoning": "The leading option combines the best success probability and execution profile.",
            "generated_at": _now().isoformat(),
        }


@pytest.fixture
def flow_client(monkeypatch: pytest.MonkeyPatch):
    state = InMemoryState()
    dummy_session = DummyAsyncSession()

    async def override_get_db_session():
        yield dummy_session

    async def override_get_current_user(request: Request):
        header = request.headers.get("Authorization")
        if not header or not header.lower().startswith("bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication credentials were not provided.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token = header.split(" ", 1)[1].strip()
        user = state.get_user_by_token(token)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user

    monkeypatch.setattr(auth_routes, "auth_service", FakeAuthService(state))
    monkeypatch.setattr(profile_routes, "profile_service", FakeProfileService(state))
    monkeypatch.setattr(case_routes, "case_service", FakeCaseService(state))
    monkeypatch.setattr(case_routes, "profile_service", FakeProfileService(state))
    monkeypatch.setattr(case_routes, "scoring_service", FakeScoringService())
    monkeypatch.setattr(case_routes, "pathway_probability_service", FakePathwayProbabilityService(state))
    monkeypatch.setattr(case_routes, "timeline_simulation_service", FakeTimelineSimulationService(state))
    monkeypatch.setattr(case_routes, "document_service", FakeDocumentService(state))
    monkeypatch.setattr(case_routes, "workspace_service", FakeWorkspaceService(state))
    monkeypatch.setattr(case_routes, "scenario_simulation_service", FakeScenarioSimulationService(state))

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[case_routes.get_copilot_chat_service] = lambda: FakeCopilotChatService(state)
    app.dependency_overrides[case_outcome_routes.get_case_outcome_service] = lambda: FakeCaseOutcomeService(state)
    app.dependency_overrides[ai_routes.get_ai_orchestrator] = lambda: FakeAIOrchestrator(state)
    app.dependency_overrides[ai_routes.get_pathway_probability_service] = lambda: FakeAIProbabilityService()
    app.dependency_overrides[ai_routes.get_timeline_simulation_service] = lambda: FakeAITimelineService()
    app.dependency_overrides[ai_routes.get_country_comparison_service] = lambda: FakeAICountryComparisonService()
    app.dependency_overrides[ai_routes.get_alternative_strategies_service] = lambda: FakeAlternativeStrategiesService()
    app.dependency_overrides[ai_routes.get_action_prioritization_service] = lambda: FakeActionPrioritizationService()
    app.dependency_overrides[ai_routes.get_profile_weakness_service] = lambda: FakeProfileWeaknessService()
    app.dependency_overrides[ai_routes.get_document_analysis_service] = lambda: FakeDocumentAnalysisService()
    app.dependency_overrides[ai_routes.get_copilot_service] = lambda: FakeCopilotService()
    app.dependency_overrides[ai_feedback_routes.get_ai_feedback_service] = lambda: FakeAIFeedbackService(state)
    app.dependency_overrides[comparison_routes.get_country_comparison_service] = lambda: FakeComparisonService()

    with TestClient(app) as client:
        yield client, state

    app.dependency_overrides.clear()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_full_user_journey_and_abuse(flow_client) -> None:
    client, state = flow_client

    register_payload = {
        "email": "qa+primary@example.com",
        "password": "StrongPass123!",
        "profile": {
            "first_name": "Aylin",
            "last_name": "Demir",
            "nationality": "Turkish",
            "current_country": "Canada",
            "target_country": "United States",
            "marital_status": MaritalStatus.SINGLE,
            "children_count": 0,
            "education_level": EducationLevel.BACHELOR,
            "english_level": EnglishLevel.ADVANCED,
            "profession": "Software Engineer",
            "years_of_experience": 7,
            "available_capital": "50000.00",
            "criminal_record_flag": False,
            "prior_visa_refusal_flag": False,
            "relocation_timeline": RelocationTimeline.WITHIN_6_MONTHS,
            "preferred_language": "en",
        },
    }
    register_response = client.post("/api/v1/auth/register", json=register_payload)
    assert register_response.status_code == 201
    assert register_response.json()["email"] == "qa+primary@example.com"

    duplicate_response = client.post("/api/v1/auth/register", json=register_payload)
    assert duplicate_response.status_code == 409
    assert duplicate_response.json()["error"]["message"] == "An account with this email already exists."

    bad_login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "qa+primary@example.com", "password": "wrong-pass-123"},
    )
    assert bad_login_response.status_code == 401
    assert bad_login_response.json()["error"]["message"] == "Invalid email or password."

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "qa+primary@example.com", "password": "StrongPass123!"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    headers = _auth_headers(token)

    me_response = client.get("/api/v1/auth/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["profile"]["profession"] == "Software Engineer"

    profile_response = client.get("/api/v1/profile/me", headers=headers)
    assert profile_response.status_code == 200
    assert profile_response.json()["target_country"] == "United States"

    update_profile_response = client.put(
        "/api/v1/profile/me",
        headers=headers,
        json={
            "education_level": EducationLevel.MASTER,
            "available_capital": "90000.00",
            "years_of_experience": 9,
        },
    )
    assert update_profile_response.status_code == 200
    assert update_profile_response.json()["education_level"] == EducationLevel.MASTER

    create_case_response = client.post(
        "/api/v1/cases",
        headers=headers,
        json={
            "title": "U.S. NIW strategy",
            "target_country": "United States",
            "target_program": "EB-2 NIW",
            "current_stage": "eligibility_review",
            "status": ImmigrationCaseStatus.IN_REVIEW,
            "notes": "Need stronger recommendation letters.",
        },
    )
    assert create_case_response.status_code == 201
    case_id = create_case_response.json()["id"]

    list_cases_response = client.get("/api/v1/cases", headers=headers)
    assert list_cases_response.status_code == 200
    assert len(list_cases_response.json()) == 1

    case_response = client.get(f"/api/v1/cases/{case_id}", headers=headers)
    assert case_response.status_code == 200
    assert case_response.json()["target_program"] == "EB-2 NIW"

    update_case_response = client.put(
        f"/api/v1/cases/{case_id}",
        headers=headers,
        json={"current_stage": "document_collection", "notes": "Updated strategy notes."},
    )
    assert update_case_response.status_code == 200
    assert update_case_response.json()["current_stage"] == "document_collection"

    score_response = client.get(f"/api/v1/cases/{case_id}/score", headers=headers)
    assert score_response.status_code == 200
    assert score_response.json()["overall_score"] > 0

    probability_response = client.get(f"/api/v1/cases/{case_id}/probability", headers=headers)
    assert probability_response.status_code == 200
    assert probability_response.json()["confidence_level"] in {"LOW", "MEDIUM", "HIGH"}

    timeline_response = client.get(f"/api/v1/cases/{case_id}/timeline", headers=headers)
    assert timeline_response.status_code == 200
    assert timeline_response.json()["steps"][0]["step_name"] == "Profile and evidence preparation"

    workspace_response = client.get(f"/api/v1/cases/{case_id}/workspace", headers=headers)
    assert workspace_response.status_code == 200
    assert workspace_response.json()["recommended_pathway"]["pathway"] == "EB-2 NIW"

    create_outcome_response = client.post(
        f"/api/v1/cases/{case_id}/outcome",
        headers=headers,
        json={
            "outcome": CaseOutcomeStatus.APPROVED,
            "duration_months": 11,
            "final_pathway": "EB-2 NIW",
            "notes": "Approved after stronger evidence was submitted.",
        },
    )
    assert create_outcome_response.status_code == 201
    assert create_outcome_response.json()["outcome"] == CaseOutcomeStatus.APPROVED

    get_outcome_response = client.get(f"/api/v1/cases/{case_id}/outcome", headers=headers)
    assert get_outcome_response.status_code == 200
    assert get_outcome_response.json()["final_pathway"] == "EB-2 NIW"

    update_outcome_response = client.put(
        f"/api/v1/cases/{case_id}/outcome",
        headers=headers,
        json={"notes": "Approved and formally recorded."},
    )
    assert update_outcome_response.status_code == 200
    assert update_outcome_response.json()["notes"] == "Approved and formally recorded."

    simulation_response = client.post(
        f"/api/v1/cases/{case_id}/simulation",
        headers=headers,
        json={
            "profile_overrides": {
                "english_level": EnglishLevel.FLUENT,
                "education_level": EducationLevel.DOCTORATE,
                "available_capital": "120000.00",
                "years_of_experience": 10,
            }
        },
    )
    assert simulation_response.status_code == 200
    assert simulation_response.json()["delta"]["probability_score_change"] > 0

    copilot_thread_response = client.get(f"/api/v1/cases/{case_id}/copilot/thread", headers=headers)
    assert copilot_thread_response.status_code == 200
    assert copilot_thread_response.json()["messages"] == []

    copilot_message_response = client.post(
        f"/api/v1/cases/{case_id}/copilot/messages",
        headers=headers,
        json={"content": "What should I do next to improve this case?"},
    )
    assert copilot_message_response.status_code == 201
    assert copilot_message_response.json()["assistant_message"]["role"] == CopilotMessageRole.ASSISTANT

    invalid_upload_response = client.post(
        f"/api/v1/cases/{case_id}/documents",
        headers=headers,
        files={"file": ("malware.exe", b"bad", "application/x-msdownload")},
        data={"document_type": "identity"},
    )
    assert invalid_upload_response.status_code == 415
    assert invalid_upload_response.json()["error"]["message"] == "Unsupported file type."

    oversized_upload_response = client.post(
        f"/api/v1/cases/{case_id}/documents",
        headers=headers,
        files={"file": ("large.pdf", b"x" * (1024 * 1024 + 1), "application/pdf")},
        data={"document_type": "passport"},
    )
    assert oversized_upload_response.status_code == 413
    assert oversized_upload_response.json()["error"]["message"] == "Uploaded file exceeds the maximum allowed size."

    valid_upload_response = client.post(
        f"/api/v1/cases/{case_id}/documents",
        headers=headers,
        files={"file": ("passport.pdf", b"%PDF-1.4 test passport", "application/pdf")},
        data={"document_type": "passport"},
    )
    assert valid_upload_response.status_code == 201
    assert valid_upload_response.json()["document_type"] == "passport"

    documents_response = client.get(f"/api/v1/cases/{case_id}/documents", headers=headers)
    assert documents_response.status_code == 200
    assert len(documents_response.json()) == 1

    strategy_response = client.post(
        "/api/v1/ai/strategy",
        headers=headers,
        json={
            "case_id": case_id,
            "question": "What is my best immigration route right now?",
            "context_mode": "case-aware",
            "use_grounding": False,
        },
    )
    assert strategy_response.status_code == 200
    assert strategy_response.json()["plans"][0]["label"] == "Plan A"

    ai_feedback_response = client.post(
        "/api/v1/ai/feedback",
        headers=headers,
        json={
            "case_id": case_id,
            "feature": AIFeature.STRATEGY,
            "rating": AIFeedbackRating.POSITIVE,
            "comment": "This was useful and actionable.",
        },
    )
    assert ai_feedback_response.status_code == 201
    assert ai_feedback_response.json()["feature"] == AIFeature.STRATEGY

    forced_failure_response = client.post(
        "/api/v1/ai/strategy",
        headers=headers,
        json={
            "case_id": case_id,
            "question": "force-failure for strategy generation",
            "context_mode": "case-aware",
            "use_grounding": False,
        },
    )
    assert forced_failure_response.status_code == 502
    assert forced_failure_response.json()["error"]["message"] == "AI strategy generation failed."

    ai_probability_response = client.post(
        "/api/v1/ai/pathway-probability",
        headers=headers,
        json={"visa_type": "H-1B Specialty Occupation"},
    )
    assert ai_probability_response.status_code == 200
    assert ai_probability_response.json()["probability_score"] == 68

    ai_timeline_response = client.post(
        "/api/v1/ai/timeline-simulation",
        headers=headers,
        json={"visa_type": "Express Entry", "target_country": "Canada"},
    )
    assert ai_timeline_response.status_code == 200
    assert ai_timeline_response.json()["total_estimated_duration_months"] == 13.0

    ai_country_comparison_response = client.post(
        "/api/v1/ai/country-comparison",
        headers=headers,
        json={
            "options": [
                {"country": "Canada", "visa_type": "Express Entry"},
                {"country": "Germany", "visa_type": "EU Blue Card"},
            ]
        },
    )
    assert ai_country_comparison_response.status_code == 200
    assert ai_country_comparison_response.json()["best_option"] == "Canada - Express Entry"

    alternative_strategies_response = client.post(
        "/api/v1/ai/alternative-strategies",
        headers=headers,
        json={"target_country": "Canada"},
    )
    assert alternative_strategies_response.status_code == 200
    assert alternative_strategies_response.json()["recommended_plan"] == "Plan A"

    action_priority_response = client.post(
        "/api/v1/ai/action-priority",
        headers=headers,
        json={"case_id": case_id, "missing_information": ["Passport upload missing."]},
    )
    assert action_priority_response.status_code == 200
    assert action_priority_response.json()["impact_level"] == "HIGH"

    profile_weaknesses_response = client.post(
        "/api/v1/ai/profile-weaknesses",
        headers=headers,
        json={},
    )
    assert profile_weaknesses_response.status_code == 200
    assert profile_weaknesses_response.json()["priority_focus"]

    document_analysis_response = client.post(
        "/api/v1/ai/document-analysis",
        headers=headers,
        json={
            "document_type": "passport",
            "extracted_text": "Passport number AB1234567 nationality Turkish expiry 2030-05-01 place of birth Ankara",
        },
    )
    assert document_analysis_response.status_code == 200
    assert document_analysis_response.json()["document_classification"] == "passport"

    ai_copilot_response = client.post(
        "/api/v1/ai/copilot",
        headers=headers,
        json={
            "case_id": case_id,
            "previous_messages": [{"role": "user", "content": "What is strongest?"}],
            "question": "What should I do next?",
        },
    )
    assert ai_copilot_response.status_code == 200
    assert ai_copilot_response.json()["suggested_actions"]

    comparison_response = client.post(
        "/api/v1/comparison",
        headers=headers,
        json={
            "options": [
                {"country": "Canada", "pathway": "Express Entry"},
                {"country": "Germany", "pathway": "EU Blue Card"},
            ]
        },
    )
    assert comparison_response.status_code == 200
    assert comparison_response.json()["best_option"] == "Canada - Express Entry"

    delete_response = client.delete(f"/api/v1/cases/{case_id}", headers=headers)
    assert delete_response.status_code == 204

    deleted_case_response = client.get(f"/api/v1/cases/{case_id}", headers=headers)
    assert deleted_case_response.status_code == 404
    assert deleted_case_response.json()["error"]["message"] == "Immigration case not found."

    assert len(state.users) == 1


def test_cross_user_ownership_abuse_is_blocked(flow_client) -> None:
    client, _state = flow_client

    first_register = client.post(
        "/api/v1/auth/register",
        json={"email": "qa+one@example.com", "password": "StrongPass123!"},
    )
    second_register = client.post(
        "/api/v1/auth/register",
        json={"email": "qa+two@example.com", "password": "StrongPass123!"},
    )
    assert first_register.status_code == 201
    assert second_register.status_code == 201

    first_token = client.post(
        "/api/v1/auth/login",
        json={"email": "qa+one@example.com", "password": "StrongPass123!"},
    ).json()["access_token"]
    second_token = client.post(
        "/api/v1/auth/login",
        json={"email": "qa+two@example.com", "password": "StrongPass123!"},
    ).json()["access_token"]

    second_case_response = client.post(
        "/api/v1/cases",
        headers=_auth_headers(second_token),
        json={
            "title": "Second user case",
            "target_country": "Canada",
            "target_program": "Express Entry",
            "status": ImmigrationCaseStatus.ACTIVE,
        },
    )
    assert second_case_response.status_code == 201
    second_case_id = second_case_response.json()["id"]

    first_user_access_response = client.get(
        f"/api/v1/cases/{second_case_id}",
        headers=_auth_headers(first_token),
    )
    assert first_user_access_response.status_code == 404
    assert first_user_access_response.json()["error"]["message"] == "Immigration case not found."

    first_user_document_access = client.get(
        f"/api/v1/cases/{second_case_id}/documents",
        headers=_auth_headers(first_token),
    )
    assert first_user_document_access.status_code == 404
    assert first_user_document_access.json()["error"]["message"] == "Immigration case not found."
