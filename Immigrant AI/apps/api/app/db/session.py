from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

engine: AsyncEngine | None = None
session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Return a lazily initialized SQLAlchemy async engine."""

    global engine, session_factory

    if engine is None:
        settings = get_settings()
        engine = create_async_engine(
            settings.database_url,
            echo=settings.debug,
            pool_pre_ping=True,
            pool_recycle=1800,
        )
        session_factory = async_sessionmaker(engine, expire_on_commit=False)

    return engine


async def get_session() -> AsyncIterator[AsyncSession]:
    """Provide an async database session dependency."""

    global session_factory

    if session_factory is None:
        get_engine()

    assert session_factory is not None

    async with session_factory() as session:
        yield session


async def get_db_session(
    session: AsyncSession = Depends(get_session),
) -> AsyncSession:
    """Expose the shared database dependency for FastAPI routes."""

    return session


async def dispose_engine() -> None:
    """Dispose the shared engine during application shutdown."""

    global engine, session_factory

    if engine is not None:
        await engine.dispose()

    engine = None
    session_factory = None
