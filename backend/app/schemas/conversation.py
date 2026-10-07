from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class MessageRead(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    tool_calls: list[dict[str, Any]] = []
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationBase(BaseModel):
    title: str = "Nova conversa"
    agent_id: str | None = None


class ConversationCreate(ConversationBase):
    pass


class ConversationRead(ConversationBase):
    id: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ConversationDetail(ConversationRead):
    messages: list[MessageRead] = []
