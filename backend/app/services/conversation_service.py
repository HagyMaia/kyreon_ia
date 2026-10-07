import json
from uuid import uuid4
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.schemas.conversation import ConversationCreate, ConversationDetail, ConversationRead, MessageRead


class ConversationService:
    async def list_conversations(self, db: AsyncSession, limit: int = 50) -> list[ConversationRead]:
        query = (
            select(ConversationModel)
            .order_by(desc(ConversationModel.updated_at))
            .limit(limit)
        )
        result = await db.execute(query)
        conversations = result.scalars().all()
        return [
            ConversationRead(
                id=c.id,
                title=c.title,
                agent_id=c.agent_id,
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
            for c in conversations
        ]

    async def get_conversation(self, db: AsyncSession, conversation_id: str) -> ConversationDetail | None:
        query = (
            select(ConversationModel)
            .where(ConversationModel.id == conversation_id)
            .options(selectinload(ConversationModel.messages))
        )
        result = await db.execute(query)
        conversation = result.scalar_one_or_none()
        if not conversation:
            return None

        messages = [
            MessageRead(
                id=m.id,
                conversation_id=m.conversation_id,
                role=m.role,
                content=m.content,
                tool_calls=m.tool_calls_list,
                created_at=m.created_at,
            )
            for m in conversation.messages
        ]

        return ConversationDetail(
            id=conversation.id,
            title=conversation.title,
            agent_id=conversation.agent_id,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            messages=messages,
        )

    async def get_or_create_conversation(
        self,
        db: AsyncSession,
        conversation_id: str | None = None,
        title: str | None = None,
        agent_id: str | None = None,
    ) -> ConversationModel:
        if conversation_id:
            query = select(ConversationModel).where(ConversationModel.id == conversation_id)
            result = await db.execute(query)
            conversation = result.scalar_one_or_none()
            if conversation:
                if agent_id and not conversation.agent_id:
                    conversation.agent_id = agent_id
                    await db.commit()
                return conversation

        new_id = conversation_id or str(uuid4())
        conversation = ConversationModel(
            id=new_id,
            title=title or "Nova conversa",
            agent_id=agent_id,
        )
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
        return conversation

    async def add_message(
        self,
        db: AsyncSession,
        conversation_id: str,
        role: str,
        content: str,
        tool_calls: list[dict] | None = None,
    ) -> MessageModel:
        msg = MessageModel(
            id=str(uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=content,
            tool_calls=json.dumps(tool_calls or []),
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        return msg

    async def delete_conversation(self, db: AsyncSession, conversation_id: str) -> bool:
        query = select(ConversationModel).where(ConversationModel.id == conversation_id)
        result = await db.execute(query)
        conversation = result.scalar_one_or_none()
        if not conversation:
            return False
        await db.delete(conversation)
        await db.commit()
        return True


conversation_service = ConversationService()
