from datetime import datetime, timezone
import json
from typing import TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.conversation import ConversationModel


class MessageModel(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tool_calls: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    conversation: Mapped["ConversationModel"] = relationship(
        "ConversationModel",
        back_populates="messages",
    )

    @property
    def tool_calls_list(self) -> list[dict]:
        try:
            return json.loads(self.tool_calls)
        except Exception:
            return []

    @tool_calls_list.setter
    def tool_calls_list(self, value: list[dict]) -> None:
        self.tool_calls = json.dumps(value)
