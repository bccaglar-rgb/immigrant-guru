from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.database import DatabaseCheckResponse

router = APIRouter(tags=["system"])


@router.get("/db-check", response_model=DatabaseCheckResponse, summary="Database connectivity check")
async def db_check(
    session: AsyncSession = Depends(get_db_session),
) -> DatabaseCheckResponse:
    await session.execute(text("SELECT 1"))
    return DatabaseCheckResponse(database="postgresql", status="ok")
