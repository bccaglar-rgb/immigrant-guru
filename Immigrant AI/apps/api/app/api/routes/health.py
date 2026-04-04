from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["system"])


@router.get("/health", summary="Service health")
async def healthcheck() -> dict[str, str]:
    """Return a lightweight health status for service monitoring."""

    settings = get_settings()
    return {"service": settings.app_name, "status": "ok"}
