from __future__ import annotations

from datetime import datetime, timezone
import json
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from redis.asyncio import Redis


class DocumentProcessingJob(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_type: str = Field(pattern="^document_post_upload_processing$")
    document_id: UUID
    case_id: UUID
    retry_count: int = Field(ge=0)
    enqueued_at: datetime


class RedisDocumentJobQueue:
    def __init__(self, *, redis_client: Redis, queue_name: str) -> None:
        self._redis_client = redis_client
        self._queue_name = queue_name
        self._processing_queue_name = f"{queue_name}:processing"

    async def reserve(self, *, timeout: int) -> str | None:
        return await self._redis_client.brpoplpush(
            self._queue_name,
            self._processing_queue_name,
            timeout=timeout,
        )

    async def acknowledge(self, raw_payload: str) -> None:
        await self._redis_client.lrem(self._processing_queue_name, 1, raw_payload)

    async def requeue(
        self,
        *,
        raw_payload: str,
        job: DocumentProcessingJob,
    ) -> None:
        next_job = job.model_copy(
            update={
                "retry_count": job.retry_count + 1,
                "enqueued_at": datetime.now(timezone.utc),
            }
        )
        next_payload = json.dumps(next_job.model_dump(mode="json"), ensure_ascii=True)
        pipeline = self._redis_client.pipeline()
        pipeline.lrem(self._processing_queue_name, 1, raw_payload)
        pipeline.rpush(self._queue_name, next_payload)
        await pipeline.execute()
