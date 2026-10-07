from datetime import datetime, timezone
import json
from sqlalchemy import Boolean, DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentModel(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(150), nullable=False, default="Assistente Virtual")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="auto")
    model: Mapped[str] = mapped_column(String(100), nullable=False, default="gpt-4o-mini")
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    tools: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    avatar: Mapped[str] = mapped_column(String(10), nullable=False, default="✦")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    @property
    def tools_list(self) -> list[str]:
        try:
            return json.loads(self.tools)
        except Exception:
            return []

    @tools_list.setter
    def tools_list(self, value: list[str]) -> None:
        self.tools = json.dumps(value)
