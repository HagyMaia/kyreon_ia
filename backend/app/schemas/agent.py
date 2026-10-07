from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant|system)$")
    content: str
    tool_calls: list[dict[str, Any]] = []


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1)
    agent_id: str | None = None
    conversation_id: str | None = None
    history: list[ChatMessage] = []
    stream: bool = False


class AgentChatResponse(BaseModel):
    conversation_id: str
    message_id: str | None = None
    agent_id: str | None = None
    content: str
    tool_calls: list[dict[str, Any]] = []


class AgentBase(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    role: str = Field(default="Assistente Virtual", max_length=150)
    description: str = Field(default="")
    system_prompt: str = Field(min_length=5)
    provider: str = Field(default="auto")
    model: str = Field(default="gpt-4o-mini")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    tools: list[str] = Field(default_factory=list)
    avatar: str = Field(default="✦", max_length=10)
    is_default: bool = False


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    provider: str | None = None
    model: str | None = None
    temperature: float | None = None
    tools: list[str] | None = None
    avatar: str | None = None
    is_default: bool | None = None


class AgentRead(AgentBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
