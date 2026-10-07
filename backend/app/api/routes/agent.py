from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.agent import AgentChatRequest, AgentChatResponse
from app.services.agent_service import agent_service

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat", response_model=AgentChatResponse)
async def chat(request: AgentChatRequest, db: AsyncSession = Depends(get_db)):
    return await agent_service.chat(db, request)


@router.post("/chat/stream")
async def chat_stream(request: AgentChatRequest, db: AsyncSession = Depends(get_db)):
    generator = agent_service.chat_stream(db, request)
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
