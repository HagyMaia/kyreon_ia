"""
Script utilitário para migrar dados do SQLite local para o PostgreSQL no Kyreon AI.
Uso:
  python scripts/migrate_sqlite_to_postgres.py "postgresql+asyncpg://usuario:senha@host:5432/banco"
"""

import asyncio
import sys
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.database import Base
from app.models.agent import AgentModel
from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.models.memory import MemoryModel

SQLITE_URL = "sqlite+aiosqlite:///./agent_platform.db"


async def migrate(target_postgres_url: str):
    target_url = target_postgres_url.strip()
    if target_url.startswith("postgresql://"):
        target_url = target_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif target_url.startswith("postgres://"):
        target_url = target_url.replace("postgres://", "postgresql+asyncpg://", 1)
    if "sslmode=require" in target_url:
        target_url = target_url.replace("sslmode=require", "ssl=require")

    print(f"--> Conectando ao SQLite: {SQLITE_URL}")
    sqlite_engine = create_async_engine(SQLITE_URL, echo=False)
    sqlite_session_maker = async_sessionmaker(sqlite_engine, expire_on_commit=False)

    print(f"--> Conectando ao PostgreSQL: {target_url}")
    pg_engine = create_async_engine(target_url, echo=False, pool_pre_ping=True)
    pg_session_maker = async_sessionmaker(pg_engine, expire_on_commit=False)

    # Cria tabelas no PostgreSQL
    print("--> Criando tabelas no PostgreSQL...")
    async with pg_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Migra dados
    async with sqlite_session_maker() as src, pg_session_maker() as dst:
        # 1. Agentes
        agents = (await src.execute(select(AgentModel))).scalars().all()
        print(f"--> Migrando {len(agents)} agente(s)...")
        for a in agents:
            await dst.merge(
                AgentModel(
                    id=a.id,
                    name=a.name,
                    role=a.role,
                    description=a.description,
                    system_prompt=a.system_prompt,
                    provider=a.provider,
                    model=a.model,
                    temperature=a.temperature,
                    tools=a.tools,
                    avatar=a.avatar,
                    is_default=a.is_default,
                    created_at=a.created_at,
                    updated_at=a.updated_at,
                )
            )

        # 2. Conversas
        convs = (await src.execute(select(ConversationModel))).scalars().all()
        print(f"--> Migrando {len(convs)} conversa(s)...")
        for c in convs:
            await dst.merge(
                ConversationModel(
                    id=c.id,
                    title=c.title,
                    agent_id=c.agent_id,
                    created_at=c.created_at,
                    updated_at=c.updated_at,
                )
            )

        # 3. Mensagens
        msgs = (await src.execute(select(MessageModel))).scalars().all()
        print(f"--> Migrando {len(msgs)} mensagem(ns)...")
        for m in msgs:
            await dst.merge(
                MessageModel(
                    id=m.id,
                    conversation_id=m.conversation_id,
                    role=m.role,
                    content=m.content,
                    tool_calls=m.tool_calls,
                    created_at=m.created_at,
                )
            )

        # 4. Memórias
        mems = (await src.execute(select(MemoryModel))).scalars().all()
        print(f"--> Migrando {len(mems)} memória(s)...")
        for mem in mems:
            await dst.merge(
                MemoryModel(
                    id=mem.id,
                    category=mem.category,
                    content=mem.content,
                    created_at=mem.created_at,
                )
            )

        await dst.commit()
        print("\n✅ Migração concluída com sucesso!")

    await sqlite_engine.dispose()
    await pg_engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Erro: forneça a URL do PostgreSQL.")
        print("Exemplo: python scripts/migrate_sqlite_to_postgres.py postgresql+asyncpg://user:pass@localhost:5432/agentdb")
        sys.exit(1)

    url = sys.argv[1].strip()
    asyncio.run(migrate(url))
