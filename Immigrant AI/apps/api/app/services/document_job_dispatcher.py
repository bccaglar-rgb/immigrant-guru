from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from redis.asyncio import from_url as redis_from_url

from app.core.config import Settings

logger = logging.getLogger("immigrant-ai-api.document-jobs")


class DocumentJobDispatchError(RuntimeError):
    """Raised when a document processing job cannot be dispatched."""


class DocumentJobDispatcher:
    """Publish lightweight document processing jobs for the worker."""

    def __init__(self, settings: Settings) -> None:
        self._queue_name = settings.document_processing_queue_name
        self._redis_url = settings.redis_url

    async def enqueue_document_processing(
        self,
        *,
        document_id: UUID,
        case_id: UUID,
    ) -> None:
        payload = json.dumps(
            {
                "job_type": "document_post_upload_processing",
                "document_id": str(document_id),
                "case_id": str(case_id),
                "retry_count": 0,
                "enqueued_at": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=True,
        )

        redis_client = redis_from_url(
            self._redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )

        try:
            await redis_client.rpush(self._queue_name, payload)
        except Exception as exc:
            logger.exception(
                "document_job.enqueue_failed",
                extra={
                    "document_id": str(document_id),
                    "case_id": str(case_id),
                },
                exc_info=exc,
            )
            raise DocumentJobDispatchError(
                "Document processing could not be queued."
            ) from exc
        finally:
            await redis_client.aclose()
