from __future__ import annotations

from collections.abc import AsyncIterator

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
    global engine, session_factory

    if engine is None:
        settings = get_settings()
        engine = create_async_engine(
            settings.database_url,
            pool_pre_ping=True,
            pool_recycle=1800,
        )
        session_factory = async_sessionmaker(engine, expire_on_commit=False)

    return engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global session_factory

    if session_factory is None:
        get_engine()

    assert session_factory is not None
    return session_factory


async def get_session() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        yield session


async def dispose_engine() -> None:
    global engine, session_factory

    if engine is not None:
        await engine.dispose()

    engine = None
    session_factory = None
