from datetime import datetime, timezone
from time import perf_counter

from redis.asyncio import from_url as redis_from_url
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import get_engine
from app.schemas.health import DependencyCheck, HealthResponse


class HealthService:
    async def get_status(self) -> HealthResponse:
        settings = get_settings()

        postgres_check = await self._check_postgres()
        redis_check = await self._check_redis(settings.redis_url)

        checks = {
            "postgres": postgres_check,
            "redis": redis_check,
        }

        overall_status = (
            "ok"
            if all(check.status == "up" for check in checks.values())
            else "degraded"
        )

        return HealthResponse(
            status=overall_status,
            service=settings.app_slug,
            environment=settings.app_env,
            version=settings.app_version,
            timestamp=datetime.now(timezone.utc),
            checks=checks,
        )

    async def _check_postgres(self) -> DependencyCheck:
        started_at = perf_counter()

        try:
            engine = get_engine()
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))

            return DependencyCheck(
                name="postgres",
                status="up",
                latency_ms=round((perf_counter() - started_at) * 1000, 2),
            )
        except Exception as exc:
            return DependencyCheck(
                name="postgres",
                status="down",
                detail=str(exc),
            )

    async def _check_redis(self, redis_url: str) -> DependencyCheck:
        started_at = perf_counter()
        redis_client = None

        try:
            redis_client = redis_from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            await redis_client.ping()

            return DependencyCheck(
                name="redis",
                status="up",
                latency_ms=round((perf_counter() - started_at) * 1000, 2),
            )
        except Exception as exc:
            return DependencyCheck(
                name="redis",
                status="down",
                detail=str(exc),
            )
        finally:
            if redis_client is not None:
                await redis_client.aclose()
