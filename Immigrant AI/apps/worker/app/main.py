import asyncio
import logging
import signal

from redis.asyncio import from_url as redis_from_url

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import dispose_engine
from app.jobs.document_processing import run_document_processing_loop
from app.jobs.heartbeat import publish_heartbeat


async def run_heartbeat_loop(*, redis_client, settings, logger, stop_event) -> None:
    while not stop_event.is_set():
        try:
            await publish_heartbeat(redis_client, settings, logger)
        except Exception:
            logger.exception("Worker heartbeat failed")

        try:
            await asyncio.wait_for(
                stop_event.wait(),
                timeout=settings.heartbeat_interval_seconds,
            )
        except asyncio.TimeoutError:
            continue


async def run_worker() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    logger = logging.getLogger(settings.app_slug)

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    for signal_name in ("SIGINT", "SIGTERM"):
        sig = getattr(signal, signal_name, None)
        if sig is not None:
            try:
                loop.add_signal_handler(sig, stop_event.set)
            except NotImplementedError:
                pass

    redis_client = redis_from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )

    logger.info("Starting %s in %s", settings.app_name, settings.app_env)

    try:
        heartbeat_task = asyncio.create_task(
            run_heartbeat_loop(
                redis_client=redis_client,
                settings=settings,
                logger=logger,
                stop_event=stop_event,
            )
        )
        processing_task = asyncio.create_task(
            run_document_processing_loop(
                redis_client=redis_client,
                settings=settings,
                logger=logger,
                stop_event=stop_event,
            )
        )

        try:
            await stop_event.wait()
        finally:
            for task in (heartbeat_task, processing_task):
                task.cancel()
            await asyncio.gather(heartbeat_task, processing_task, return_exceptions=True)
    finally:
        await redis_client.aclose()
        await dispose_engine()
        logger.info("Stopped %s", settings.app_name)


def run() -> None:
    asyncio.run(run_worker())


if __name__ == "__main__":
    run()
