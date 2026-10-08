"""
Script utilitário para migrar dados do SQLite local para o PostgreSQL no Kyreon AI.
Uso:
  python scripts/migrate_sqlite_to_postgres.py "postgresql+asyncpg://usuario:senha@host:5432/banco"
"""

import asyncio
import sys
from pathlib import Path

# Adiciona o diretório backend ao sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.database import Base, get_normalized_database_url
from app.models.agent import AgentModel
from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.models.memory import MemoryModel

SQLITE_URL = "sqlite+aiosqlite:///./agent_platform.db"


async def migrate(target_postgres_url: str):
    target_url = get_normalized_database_url(target_postgres_url)

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
        valid_agent_ids = set()
        for a in agents:
            valid_agent_ids.add(a.id)
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
        await dst.flush()

        # 2. Conversas
        convs = (await src.execute(select(ConversationModel))).scalars().all()
        print(f"--> Analisando {len(convs)} conversa(s)...")
        valid_conv_ids = set()
        for c in convs:
            if c.agent_id and c.agent_id not in valid_agent_ids:
                print(f"    [INFO] Ignorando conversa de teste órfã {c.id} (agente inexistente: '{c.agent_id}')")
                continue
            valid_conv_ids.add(c.id)
            await dst.merge(
                ConversationModel(
                    id=c.id,
                    title=c.title,
                    agent_id=c.agent_id,
                    created_at=c.created_at,
                    updated_at=c.updated_at,
                )
            )
        await dst.flush()

        # 3. Mensagens
        msgs = (await src.execute(select(MessageModel))).scalars().all()
        print(f"--> Analisando {len(msgs)} mensagem(ns)...")
        migrated_msgs = 0
        for m in msgs:
            if m.conversation_id not in valid_conv_ids:
                continue
            migrated_msgs += 1
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
        print(f"    [INFO] {migrated_msgs} mensagem(ns) válidas migradas.")
        await dst.flush()

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
