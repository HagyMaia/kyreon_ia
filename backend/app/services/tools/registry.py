from typing import Any
from app.services.tools.base import BaseTool
from app.services.tools.builtin import CalculatorTool, CurrentDateTimeTool, WebSearchTool


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}
        self._register_default_tools()

    def _register_default_tools(self) -> None:
        self.register(CurrentDateTimeTool())
        self.register(CalculatorTool())
        self.register(WebSearchTool())

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    def list_tools(self) -> list[BaseTool]:
        return list(self._tools.values())

    def get_schemas_for_tools(self, tool_names: list[str]) -> list[dict[str, Any]]:
        schemas = []
        for name in tool_names:
            tool = self.get_tool(name)
            if tool:
                schemas.append(tool.to_openai_schema())
        return schemas

    async def execute_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        tool = self.get_tool(name)
        if not tool:
            return {"error": f"Ferramenta '{name}' não encontrada."}
        return await tool.execute(**arguments)


tool_registry = ToolRegistry()
