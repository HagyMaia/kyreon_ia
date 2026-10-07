from fastapi import APIRouter
from app.schemas.model import ToolInfo
from app.services.tools.registry import tool_registry

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=list[ToolInfo])
async def list_tools():
    tools = tool_registry.list_tools()
    return [
        ToolInfo(
            id=t.name,
            name=t.name,
            description=t.description,
            parameters=t.parameters,
        )
        for t in tools
    ]
