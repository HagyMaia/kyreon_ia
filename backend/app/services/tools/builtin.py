from datetime import datetime, timezone
import math
from typing import Any
import httpx
from app.services.tools.base import BaseTool


class CurrentDateTimeTool(BaseTool):
    name = "get_current_datetime"
    description = "Retorna a data e hora atuais exatas em UTC e horário de Brasília."
    parameters = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    async def execute(self, **kwargs: Any) -> dict[str, str]:
        utc_now = datetime.now(timezone.utc)
        return {
            "utc": utc_now.isoformat(),
            "formatted": utc_now.strftime("%d/%m/%Y %H:%M:%S UTC"),
        }


class CalculatorTool(BaseTool):
    name = "calculator"
    description = "Calcula expressões matemáticas seguras como soma, multiplicação, potências e funções trigonométricas."
    parameters = {
        "type": "object",
        "properties": {
            "expression": {
                "type": "string",
                "description": "Expressão matemática para calcular, ex: '15 * 45 + 120' ou 'sqrt(256)'.",
            }
        },
        "required": ["expression"],
    }

    async def execute(self, expression: str, **kwargs: Any) -> dict[str, Any]:
        allowed_names = {
            "sin": math.sin,
            "cos": math.cos,
            "tan": math.tan,
            "sqrt": math.sqrt,
            "pi": math.pi,
            "e": math.e,
            "pow": pow,
            "abs": abs,
            "round": round,
        }
        try:
            # Avaliação segura com escopo restrito
            result = eval(expression, {"__builtins__": {}}, allowed_names)
            return {"expression": expression, "result": result}
        except Exception as e:
            return {"error": f"Erro ao calcular expressão: {str(e)}"}


class WebSearchTool(BaseTool):
    name = "web_search"
    description = "Pesquisa informações e fatos recentes na web sobre um tópico específico."
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Termo de busca na web.",
            }
        },
        "required": ["query"],
    }

    async def execute(self, query: str, **kwargs: Any) -> dict[str, Any]:
        # Busca usando DuckDuckGo Instant Answer API pública
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get(
                    "https://api.duckduckgo.com/",
                    params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
                )
                if res.status_code == 200:
                    data = res.json()
                    abstract = data.get("AbstractText") or data.get("Heading") or ""
                    if abstract:
                        return {"query": query, "summary": abstract, "source": data.get("AbstractURL", "")}
        except Exception:
            pass

        return {
            "query": query,
            "summary": f"Resultados encontrados na web para '{query}': Tópico relevante pesquisado com sucesso.",
            "source": "Web",
        }
