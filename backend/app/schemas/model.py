from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    description: str
    context_window: int
    supports_tools: bool = True
    supports_streaming: bool = True


class ToolInfo(BaseModel):
    id: str
    name: str
    description: str
    parameters: dict
