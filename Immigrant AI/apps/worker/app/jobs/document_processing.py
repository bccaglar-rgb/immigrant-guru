from __future__ import annotations

import logging

from pydantic import ValidationError
from redis.asyncio import Redis

from app.core.config import Settings
from app.db.session import get_session_factory
from app.queues.document_jobs import DocumentProcessingJob, RedisDocumentJobQueue
from app.services.document_pipeline import DocumentAnalysisPipeline
from app.services.document_processor import DocumentProcessor


async def run_document_processing_loop(
    *,
    redis_client: Redis,
    settings: Settings,
    logger: logging.Logger,
    stop_event,
) -> None:
    queue = RedisDocumentJobQueue(
        redis_client=redis_client,
        queue_name=settings.document_processing_queue_name,
    )
    processor = DocumentProcessor(pipeline=DocumentAnalysisPipeline(settings))
    session_factory = get_session_factory()

    while not stop_event.is_set():
        raw_payload = await queue.reserve(
            timeout=settings.document_processing_block_timeout_seconds
        )
        if raw_payload is None:
            continue

        try:
            job = DocumentProcessingJob.model_validate_json(raw_payload)
        except ValidationError:
            logger.exception("document.job_invalid_payload")
            await queue.acknowledge(raw_payload)
            continue

        should_ack = True

        try:
            async with session_factory() as session:
                await processor.process(session, job)
        except Exception:
            logger.exception(
                "document.job_unhandled_failure",
                extra={"document_id": str(job.document_id)},
            )
            current_attempt = job.retry_count + 1
            if current_attempt < settings.document_processing_max_retries:
                try:
                    await queue.requeue(raw_payload=raw_payload, job=job)
                    should_ack = False
                    logger.warning(
                        "document.job_requeued",
                        extra={
                            "document_id": str(job.document_id),
                            "retry_count": job.retry_count + 1,
                        },
                    )
                    continue
                except Exception:
                    logger.exception(
                        "document.job_requeue_failed",
                        extra={"document_id": str(job.document_id)},
                    )

            try:
                async with session_factory() as session:
                    await processor.mark_terminal_failure(
                        session,
                        document_id=job.document_id,
                        case_id=job.case_id,
                        error_message=(
                            "Document processing failed repeatedly and requires review."
                        ),
                    )
            except Exception:
                logger.exception(
                    "document.job_terminal_failure_persist_failed",
                    extra={"document_id": str(job.document_id)},
                )
        finally:
            if should_ack:
                await queue.acknowledge(raw_payload)
