from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.enums import AuditEventType, AuditTargetEntityType
from app.schemas.ai import (
    AIStrategyRequest,
    AIStrategyResponse,
    AIStrategySourceAttribution,
    MissingInformationSummary,
)
from app.schemas.knowledge import KnowledgeSearchRequest, KnowledgeSearchResult
from app.services.ai.ai_client import (
    AIClient,
    AIClientConfigurationError,
    AIClientResponseError,
)
from app.services.shared.audit_service import AuditService
from app.services.ai.ai_prompt_builder import (
    GroundingPromptReference,
    StrategyPromptBuilder,
)
from app.services.ai.ai_response_normalizer import AIStrategyResponseNormalizer
from app.services.cases.case_service import CaseService
from app.services.knowledge.knowledge_retrieval_service import KnowledgeRetrievalService
from app.services.ai.missing_information_service import MissingInformationService
from app.services.profile.profile_service import ProfileService
from app.services.ai.strategy_confidence_service import StrategyConfidenceService

logger = logging.getLogger("immigrant-ai-api.ai_orchestrator")


class AIOrchestrator:
    """Coordinate authenticated strategy generation across domain services."""

    def __init__(
        self,
        *,
        ai_client: AIClient,
        audit_service: AuditService | None,
        confidence_service: StrategyConfidenceService,
        case_service: CaseService,
        knowledge_retrieval_service: KnowledgeRetrievalService | None,
        missing_information_service: MissingInformationService,
        response_normalizer: AIStrategyResponseNormalizer,
        profile_service: ProfileService,
        prompt_builder: StrategyPromptBuilder,
    ) -> None:
        self._ai_client = ai_client
        self._audit_service = audit_service or AuditService()
        self._confidence_service = confidence_service
        self._case_service = case_service
        self._knowledge_retrieval_service = knowledge_retrieval_service
        self._missing_information_service = missing_information_service
        self._response_normalizer = response_normalizer
        self._profile_service = profile_service
        self._prompt_builder = prompt_builder

    async def generate_strategy(
        self,
        *,
        session: AsyncSession,
        user: User,
        payload: AIStrategyRequest,
    ) -> AIStrategyResponse:
        immigration_case = await self._case_service.get_case(session, user, payload.case_id)
        profile = await self._profile_service.get_or_create_profile(session, user)
        missing_information = self._missing_information_service.evaluate(
            profile=profile,
            immigration_case=immigration_case,
        )
        grounding_results: list[KnowledgeSearchResult] = []
        grounding_backend: str | None = None

        if payload.use_grounding and self._knowledge_retrieval_service is not None:
            retrieval_request = self._build_grounding_query(
                question=payload.question,
                case_target_country=immigration_case.target_country,
                case_target_program=immigration_case.target_program,
                profile_target_country=profile.target_country,
                preferred_language=profile.preferred_language,
            )

            try:
                retrieval_response = await self._knowledge_retrieval_service.search(
                    session=session,
                    payload=retrieval_request,
                )
            except Exception as exc:
                logger.warning(
                    "ai.strategy_grounding_unavailable",
                    extra={
                        "case_id": str(immigration_case.id),
                        "context_mode": payload.context_mode.value,
                    },
                    exc_info=exc,
                )
            else:
                grounding_results = retrieval_response.results
                grounding_backend = retrieval_response.backend

        prompt_bundle = self._prompt_builder.build(
            case=immigration_case,
            profile=profile,
            question=payload.question,
            context_mode=payload.context_mode,
            critical_missing_information=missing_information.critical_items,
            helpful_missing_information=missing_information.helpful_items,
            grounded_references=self._build_grounding_prompt_references(grounding_results),
            grounding_backend=grounding_backend,
        )

        logger.info(
            "ai.strategy_requested",
            extra={
                "case_id": str(immigration_case.id),
                "context_mode": payload.context_mode.value,
                "grounding_used": bool(grounding_results),
                "grounding_backend": grounding_backend,
            },
        )

        try:
            ai_result = await self._ai_client.generate_strategy(
                system_prompt=prompt_bundle.system_prompt,
                user_prompt=prompt_bundle.user_prompt,
            )
        except AIClientConfigurationError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc
        except AIClientResponseError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(exc),
            ) from exc

        normalized_result = self._response_normalizer.normalize(
            case_id=str(immigration_case.id),
            output=ai_result.output,
            fallback_missing_information=missing_information.all_items,
        )
        confidence = self._confidence_service.evaluate(
            missing_information=missing_information,
            grounding_used=bool(grounding_results),
            plan_count=len(normalized_result.output.plans),
            normalization_issue_count=len(normalized_result.issues),
        )

        source_attributions = self._build_source_attributions(grounding_results)
        await self._audit_service.record_event(
            session,
            actor_user_id=user.id,
            event_type=AuditEventType.AI_STRATEGY_GENERATED,
            target_entity_type=AuditTargetEntityType.IMMIGRATION_CASE,
            target_entity_id=immigration_case.id,
            metadata={
                "context_mode": payload.context_mode,
                "provider": ai_result.provider,
                "model": ai_result.model,
                "grounding_used": bool(grounding_results),
                "grounding_backend": grounding_backend,
                "source_count": len(source_attributions),
                "plan_count": len(normalized_result.output.plans),
                "confidence_label": confidence.confidence_label,
                "confidence_score": confidence.confidence_score,
                "critical_missing_count": len(missing_information.critical_items),
                "normalization_issue_count": len(normalized_result.issues),
            },
        )

        logger.info(
            "ai.strategy_completed",
            extra={
                "case_id": str(immigration_case.id),
                "context_mode": payload.context_mode.value,
                "provider": ai_result.provider,
                "model": ai_result.model,
                "request_id": ai_result.request_id,
                "grounding_used": bool(grounding_results),
                "grounding_backend": grounding_backend,
                "grounding_source_count": len(source_attributions),
                "confidence_label": confidence.confidence_label.value,
                "confidence_score": confidence.confidence_score,
                "critical_missing_count": len(missing_information.critical_items),
                "normalization_issue_count": len(normalized_result.issues),
            },
        )

        response_payload = normalized_result.output.model_dump()
        response_payload["confidence_label"] = confidence.confidence_label

        return AIStrategyResponse(
            case_id=immigration_case.id,
            context_mode=payload.context_mode,
            provider=ai_result.provider,
            model=ai_result.model,
            generated_at=datetime.now(timezone.utc),
            grounding_used=bool(grounding_results),
            grounding_backend=grounding_backend,
            sources_used=source_attributions,
            missing_information_by_severity=MissingInformationSummary(
                critical=missing_information.critical_items,
                helpful=missing_information.helpful_items,
            ),
            confidence_score=confidence.confidence_score,
            confidence_reasons=confidence.confidence_reasons,
            **response_payload,
        )

    @staticmethod
    def _build_grounding_query(
        *,
        question: str,
        case_target_country: str | None,
        case_target_program: str | None,
        profile_target_country: str | None,
        preferred_language: str | None,
    ) -> KnowledgeSearchRequest:
        return KnowledgeSearchRequest(
            query=question,
            country=case_target_country or profile_target_country,
            visa_type=case_target_program,
            language=preferred_language,
            limit=5,
        )

    @staticmethod
    def _build_grounding_prompt_references(
        results: Sequence[KnowledgeSearchResult],
    ) -> list[GroundingPromptReference]:
        references: list[GroundingPromptReference] = []

        for result in results:
            references.append(
                GroundingPromptReference(
                    source_id=str(result.source.id),
                    source_name=result.source.source_name,
                    source_type=result.source.source_type.value,
                    country=result.source.country,
                    visa_type=result.source.visa_type,
                    language=result.source.language,
                    authority_level=result.source.authority_level.value,
                    published_at=(
                        result.source.published_at.isoformat()
                        if result.source.published_at
                        else None
                    ),
                    verified_at=(
                        result.source.verified_at.isoformat()
                        if result.source.verified_at
                        else None
                    ),
                    relevance_score=result.score,
                    match_reason=result.match_reason,
                    excerpt=result.chunk.chunk_text[:1200],
                )
            )

        return references

    @staticmethod
    def _build_source_attributions(
        results: Sequence[KnowledgeSearchResult],
    ) -> list[AIStrategySourceAttribution]:
        seen_source_ids: set[str] = set()
        attributions: list[AIStrategySourceAttribution] = []

        for result in results:
            source_id = str(result.source.id)
            if source_id in seen_source_ids:
                continue

            seen_source_ids.add(source_id)
            attributions.append(
                AIStrategySourceAttribution(
                    source_id=result.source.id,
                    source_name=result.source.source_name,
                    source_type=result.source.source_type,
                    country=result.source.country,
                    visa_type=result.source.visa_type,
                    language=result.source.language,
                    authority_level=result.source.authority_level,
                    published_at=result.source.published_at,
                    verified_at=result.source.verified_at,
                )
            )

        return attributions
