from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import async_session_maker
from app.models.memory import MemoryModel


class MemoryService:
    async def save_memory(self, content: str, category: str = "preference", db: AsyncSession | None = None) -> dict[str, str]:
        memory_id = str(uuid4())
        memory = MemoryModel(id=memory_id, category=category, content=content)
        
        if db is not None:
            db.add(memory)
            await db.commit()
        else:
            async with async_session_maker() as session:
                session.add(memory)
                await session.commit()
                
        return {"id": memory_id, "category": category, "content": content, "status": "saved"}

    async def list_memories(self, db: AsyncSession | None = None) -> list[dict[str, str]]:
        if db is not None:
            query = select(MemoryModel).order_by(MemoryModel.created_at.desc())
            result = await db.execute(query)
            memories = result.scalars().all()
        else:
            async with async_session_maker() as session:
                query = select(MemoryModel).order_by(MemoryModel.created_at.desc())
                result = await session.execute(query)
                memories = result.scalars().all()
                
        return [{"id": m.id, "category": m.category, "content": m.content} for m in memories]


memory_service = MemoryService()
