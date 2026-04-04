import json
import logging
from datetime import datetime, timezone

from redis.asyncio import Redis

from app.core.config import Settings


async def publish_heartbeat(
    redis_client: Redis, settings: Settings, logger: logging.Logger
) -> None:
    payload = json.dumps(
        {
            "service": settings.app_slug,
            "environment": settings.app_env,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )

    await redis_client.publish(settings.heartbeat_channel, payload)
    logger.info("Published heartbeat to %s", settings.heartbeat_channel)
