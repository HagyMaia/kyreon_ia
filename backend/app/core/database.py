from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

import urllib.parse
import logging

logger = logging.getLogger("kyreon.database")

def get_normalized_database_url(raw_url: str) -> str:
    url = (raw_url or "").strip().strip("'\"`")
    if url.lower().startswith("connection string:"):
        url = url[18:].strip().strip("'\"`")
    if url.startswith("psql "):
        url = url[5:].strip().strip("'\"`")

    if not url or url.startswith("sqlite"):
        return url or "sqlite+aiosqlite:///agent_platform.db"

    try:
        parsed = urllib.parse.urlsplit(url)
        scheme = parsed.scheme
        if scheme in ("postgresql", "postgres"):
            scheme = "postgresql+asyncpg"
        elif not scheme.startswith("postgresql+"):
            scheme = "postgresql+asyncpg"

        query_params = urllib.parse.parse_qs(parsed.query)
        # Remove libpq-specific params unsupported by asyncpg
        query_params.pop("channel_binding", None)
        had_sslmode = query_params.pop("sslmode", None)
        if had_sslmode or "ssl" in query_params or "neon.tech" in parsed.netloc:
            query_params["ssl"] = ["require"]

        new_query = urllib.parse.urlencode(query_params, doseq=True)
        return urllib.parse.urlunsplit((scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))
    except Exception as exc:
        logger.error("[Kyreon DB] Falha ao normalizar DATABASE_URL '%s': %s. Usando SQLite fallback.", raw_url, exc)
        return "sqlite+aiosqlite:///agent_platform.db"


database_url = get_normalized_database_url(settings.DATABASE_URL)
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}

try:
    engine = create_async_engine(
        database_url,
        echo=False,
        pool_pre_ping=True,
        connect_args=connect_args,
    )
except Exception as e:
    logger.error("[Kyreon DB] Erro crítico ao criar engine para '%s': %s. Ativando SQLite de recuperação.", database_url, e)
    database_url = "sqlite+aiosqlite:///agent_platform.db"
    connect_args = {"check_same_thread": False}
    engine = create_async_engine(
        database_url,
        echo=False,
        pool_pre_ping=True,
        connect_args=connect_args,
    )

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()
