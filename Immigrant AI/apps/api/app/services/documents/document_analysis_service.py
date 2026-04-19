from __future__ import annotations

from fastapi import HTTPException, status

from app.schemas.ai import DocumentAnalysisRequest, DocumentAnalysisResponse
from app.services.ai.ai_client import (
    AIClient,
    AIClientConfigurationError,
    AIClientResponseError,
)
from app.services.ai.ai_prompt_builder import DocumentAnalysisPromptBuilder


class DocumentAnalysisService:
    """Analyze extracted document text into a structured product response."""

    def __init__(
        self,
        *,
        ai_client: AIClient,
        prompt_builder: DocumentAnalysisPromptBuilder,
    ) -> None:
        self._ai_client = ai_client
        self._prompt_builder = prompt_builder

    async def analyze(
        self,
        *,
        payload: DocumentAnalysisRequest,
    ) -> DocumentAnalysisResponse:
        prompt_bundle = self._prompt_builder.build(
            document_type=payload.document_type,
            extracted_text=payload.extracted_text,
        )

        try:
            result = await self._ai_client.generate_document_analysis(
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

        return result.output
