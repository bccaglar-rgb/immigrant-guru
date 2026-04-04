from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case_timeline_snapshot import CaseTimelineSnapshot
from app.models.enums import (
    EnglishLevel,
    ImmigrationCaseStatus,
    RelocationTimeline,
)
from app.models.immigration_case import ImmigrationCase
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.timeline import CaseTimelineRead, CaseTimelineStepRead
from app.services.case_service import CaseService
from app.services.missing_information_service import MissingInformationEvaluation, MissingInformationService
from app.services.profile_service import ProfileService
from app.services.timeline_helpers import (
    TimelineStepTemplate,
    coerce_value,
    get_timeline_definition,
    keywords_for_program,
    round_months,
)


class TimelineSimulationService:
    """Deterministic case-level timeline estimation with optional snapshot caching."""

    def __init__(
        self,
        *,
        case_service: CaseService,
        profile_service: ProfileService,
        missing_information_service: MissingInformationService,
        snapshot_ttl_minutes: int = 720,
    ) -> None:
        self._case_service = case_service
        self._profile_service = profile_service
        self._missing_information_service = missing_information_service
        self._snapshot_ttl_minutes = max(snapshot_ttl_minutes, 0)

    async def simulate_case(
        self,
        *,
        session: AsyncSession,
        user: User,
        case_id: UUID,
    ) -> CaseTimelineRead:
        immigration_case = await self._case_service.get_case(session, user, case_id)
        profile = await self._profile_service.get_or_create_profile(session, user)
        signature = self._build_input_signature(
            profile=profile,
            immigration_case=immigration_case,
        )

        cached = await self._get_cached_snapshot(
            session=session,
            case_id=immigration_case.id,
            signature=signature,
        )
        if cached is not None:
            return cached

        missing_information = self._missing_information_service.evaluate(
            profile=profile,
            immigration_case=immigration_case,
        )
        timeline = self._build_timeline_result(
            profile=profile,
            immigration_case=immigration_case,
            missing_information=missing_information,
        )

        snapshot = CaseTimelineSnapshot(
            case_id=immigration_case.id,
            simulation_json={
                "input_signature": signature,
                "payload": timeline.model_dump(mode="json"),
            },
            generated_at=timeline.generated_at,
        )
        session.add(snapshot)
        await session.commit()
        return timeline

    def build_timeline(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
    ) -> CaseTimelineRead:
        missing_information = self._missing_information_service.evaluate(
            profile=profile,
            immigration_case=immigration_case,
        )
        return self._build_timeline_result(
            profile=profile,
            immigration_case=immigration_case,
            missing_information=missing_information,
        )

    async def _get_cached_snapshot(
        self,
        *,
        session: AsyncSession,
        case_id: UUID,
        signature: str,
    ) -> CaseTimelineRead | None:
        if self._snapshot_ttl_minutes <= 0:
            return None

        result = await session.execute(
            select(CaseTimelineSnapshot)
            .where(CaseTimelineSnapshot.case_id == case_id)
            .order_by(CaseTimelineSnapshot.generated_at.desc())
            .limit(1)
        )
        snapshot = result.scalar_one_or_none()
        if snapshot is None:
            return None

        if snapshot.generated_at < datetime.now(timezone.utc) - timedelta(
            minutes=self._snapshot_ttl_minutes
        ):
            return None

        snapshot_signature = snapshot.simulation_json.get("input_signature")
        payload = snapshot.simulation_json.get("payload")
        if snapshot_signature != signature or not isinstance(payload, dict):
            return None

        return CaseTimelineRead.model_validate(payload)

    def _build_timeline_result(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        missing_information: MissingInformationEvaluation,
    ) -> CaseTimelineRead:
        target_country = coerce_value(immigration_case.target_country or profile.target_country)
        target_program = coerce_value(immigration_case.target_program)
        definition = get_timeline_definition(
            target_country=target_country,
            target_program=target_program,
        )

        adjusted_steps = [
            self._build_step(
                template=template,
                profile=profile,
                immigration_case=immigration_case,
                missing_information=missing_information,
            )
            for template in definition.steps
        ]
        total_duration = round_months(
            sum(step.estimated_duration_months for step in adjusted_steps)
        )

        return CaseTimelineRead(
            case_id=immigration_case.id,
            target_country=target_country,
            target_program=target_program,
            disclaimer=(
                "This is a deterministic planning timeline estimate. "
                "It supports preparation decisions and does not guarantee government processing times."
            ),
            total_estimated_duration_months=total_duration,
            steps=adjusted_steps,
            delay_risks=self._build_delay_risks(
                profile=profile,
                immigration_case=immigration_case,
                missing_information=missing_information,
                target_program=target_program,
            ),
            acceleration_tips=self._build_acceleration_tips(
                profile=profile,
                immigration_case=immigration_case,
                missing_information=missing_information,
                target_program=target_program,
            ),
            generated_at=datetime.now(timezone.utc),
        )

    def _build_step(
        self,
        *,
        template: TimelineStepTemplate,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        missing_information: MissingInformationEvaluation,
    ) -> CaseTimelineStepRead:
        duration = template.base_duration_months
        target_program = (coerce_value(immigration_case.target_program) or "").lower()

        prep_multiplier = 1.0
        review_multiplier = 1.0

        critical_count = len(missing_information.critical_items)
        helpful_count = len(missing_information.helpful_items)

        if template.phase == "preparation":
            prep_multiplier += min(0.35, critical_count * 0.06)
            prep_multiplier += min(0.15, helpful_count * 0.02)
            if profile.relocation_timeline == RelocationTimeline.EXPLORING:
                prep_multiplier += 0.12
            if (
                keywords_for_program(target_program, "skilled")
                and profile.english_level in {EnglishLevel.NONE, EnglishLevel.BASIC}
            ):
                prep_multiplier += 0.18
            if (
                keywords_for_program(target_program, "investor")
                and profile.available_capital is None
            ):
                prep_multiplier += 0.22
        elif template.phase == "review":
            review_multiplier += min(0.20, critical_count * 0.03)
            if profile.prior_visa_refusal_flag is True:
                review_multiplier += 0.2
            if profile.criminal_record_flag is True:
                review_multiplier += 0.25
        elif template.phase == "decision":
            if profile.prior_visa_refusal_flag is True:
                review_multiplier += 0.1

        duration *= prep_multiplier if template.phase == "preparation" else 1.0
        duration *= review_multiplier if template.phase in {"review", "decision"} else 1.0

        status = immigration_case.status
        if status in {ImmigrationCaseStatus.IN_REVIEW, ImmigrationCaseStatus.ACTIVE}:
            if template.phase == "preparation":
                duration *= 0.65
            elif template.phase == "filing":
                duration *= 0.8
        if status == ImmigrationCaseStatus.ACTIVE and template.phase == "review":
            duration *= 0.9
        if status == ImmigrationCaseStatus.CLOSED and template.phase in {
            "preparation",
            "filing",
        }:
            duration *= 0.5

        if immigration_case.current_stage:
            stage = immigration_case.current_stage.strip().lower()
            if "document" in stage and template.phase == "preparation":
                duration *= 0.78
            if any(keyword in stage for keyword in {"fil", "submi"}) and template.phase in {
                "preparation",
                "filing",
            }:
                duration *= 0.72
            if any(keyword in stage for keyword in {"review", "processing"}) and template.phase == "review":
                duration *= 0.86

        return CaseTimelineStepRead(
            step_name=template.step_name,
            estimated_duration_months=round_months(duration),
            description=template.description,
        )

    def _build_delay_risks(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        missing_information: MissingInformationEvaluation,
        target_program: str | None,
    ) -> list[str]:
        risks: list[str] = []

        if missing_information.critical_items:
            risks.append(
                "Critical profile or case gaps can delay document preparation and filing readiness."
            )
        if profile.prior_visa_refusal_flag is True:
            risks.append(
                "Prior refusal history may increase review depth and extend final decision timing."
            )
        if profile.criminal_record_flag is True:
            risks.append(
                "Declared criminal record issues may trigger additional review or eligibility scrutiny."
            )
        if target_program and keywords_for_program(target_program.lower(), "investor"):
            if profile.available_capital is None:
                risks.append(
                    "Missing capital evidence can delay investor-pathway viability and source-of-funds preparation."
                )
        if not immigration_case.notes:
            risks.append(
                "Thin case notes can slow preparation because pathway-specific evidence is less organized."
            )

        return risks[:6]

    def _build_acceleration_tips(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        missing_information: MissingInformationEvaluation,
        target_program: str | None,
    ) -> list[str]:
        tips: list[str] = []

        if missing_information.critical_items:
            tips.append(
                "Resolve the highest-impact missing profile fields before collecting pathway-specific evidence."
            )
        if keywords_for_program((target_program or "").lower(), "skilled"):
            tips.append(
                "Prepare language, education, and employment evidence early to shorten skilled-pathway preparation."
            )
        if keywords_for_program((target_program or "").lower(), "investor"):
            tips.append(
                "Organize capital proof and source-of-funds records before formal filing steps."
            )
        if immigration_case.current_stage is None:
            tips.append(
                "Record the current case stage clearly so preparation and review sequencing can be tightened."
            )
        if profile.preferred_language:
            tips.append(
                "Keep all translated records consistent with the preferred working language to reduce rework."
            )

        return tips[:6]

    def _build_input_signature(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
    ) -> str:
        payload = {
            "case": {
                "title": coerce_value(immigration_case.title),
                "target_country": coerce_value(immigration_case.target_country),
                "target_program": coerce_value(immigration_case.target_program),
                "current_stage": coerce_value(immigration_case.current_stage),
                "status": coerce_value(immigration_case.status),
                "notes": coerce_value(immigration_case.notes),
                "updated_at": immigration_case.updated_at.isoformat()
                if getattr(immigration_case, "updated_at", None)
                else None,
            },
            "profile": {
                "nationality": coerce_value(profile.nationality),
                "current_country": coerce_value(profile.current_country),
                "target_country": coerce_value(profile.target_country),
                "education_level": coerce_value(profile.education_level),
                "english_level": coerce_value(profile.english_level),
                "profession": coerce_value(profile.profession),
                "years_of_experience": profile.years_of_experience,
                "available_capital": str(profile.available_capital)
                if isinstance(profile.available_capital, Decimal)
                else profile.available_capital,
                "criminal_record_flag": profile.criminal_record_flag,
                "prior_visa_refusal_flag": profile.prior_visa_refusal_flag,
                "relocation_timeline": coerce_value(profile.relocation_timeline),
                "updated_at": profile.updated_at.isoformat()
                if getattr(profile, "updated_at", None)
                else None,
            },
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
