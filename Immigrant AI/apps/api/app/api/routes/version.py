from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["system"])


@router.get("/version", summary="Service version metadata")
async def version() -> dict[str, str]:
    """Return application version and environment metadata."""

    settings = get_settings()
    return {
        "name": settings.app_name,
        "environment": settings.app_env,
        "version": settings.app_version,
    }
