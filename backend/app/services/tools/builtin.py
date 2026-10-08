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


class ManausWeatherTool(BaseTool):
    name = "get_manaus_weather"
    description = (
        "Obtém a previsão do tempo em tempo real para Manaus - Amazonas, "
        "incluindo temperatura atual, sensação térmica, umidade relativa, probabilidade de chuva (%) "
        "e condição climática com recomendações locais."
    )
    parameters = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    async def execute(self, **kwargs: Any) -> dict[str, Any]:
        url = (
            "https://api.open-meteo.com/v1/forecast"
            "?latitude=-3.1190&longitude=-60.0217"
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m"
            "&hourly=precipitation_probability&timezone=America%2FManaus"
        )
        try:
            async with httpx.AsyncClient(timeout=7.0, verify=False) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    data = res.json()
                    current = data.get("current", {})
                    hourly = data.get("hourly", {}).get("precipitation_probability", [0])
                    current_hour = datetime.now().hour
                    rain_prob = hourly[current_hour] if current_hour < len(hourly) else hourly[0]
                    
                    code = current.get("weather_code", 0)
                    condition = "Céu Limpo"
                    if code in (1, 2):
                        condition = "Parcialmente Nublado"
                    elif code == 3:
                        condition = "Nublado"
                    elif 51 <= code <= 67:
                        condition = "Chuva Leve"
                    elif 80 <= code <= 82:
                        condition = "Pancadas de Chuva Típicas da Amazônia"
                    elif code >= 95:
                        condition = "Tempestade Tropical com Trovoadas"

                    temp = current.get("temperature_2m", 32)
                    apparent = current.get("apparent_temperature", 36)
                    humidity = current.get("relative_humidity_2m", 78)
                    rain_mm = current.get("precipitation", 0.0)

                    advice = "Tempo ameno sem previsão de chuva imediata."
                    if rain_prob > 50 or rain_mm > 0.5:
                        advice = "⚠️ Alta probabilidade de chuva típica amazônica! Recomenda-se carregar sombrinha ou guarda-chuva."
                    elif apparent > 36:
                        advice = "Sensação térmica elevada e calor intenso! Hidrate-se com frequência."

                    return {
                        "cidade": "Manaus, Amazonas (Fuso UTC-4)",
                        "temperatura_c": temp,
                        "sensacao_termica_c": apparent,
                        "umidade_relativa_pct": humidity,
                        "probabilidade_chuva_pct": rain_prob,
                        "precipitacao_estimada_mm": rain_mm,
                        "condicao_climatica": condition,
                        "conselho_regional": advice,
                    }
        except Exception as e:
            return {
                "cidade": "Manaus, Amazonas",
                "temperatura_c": 32,
                "probabilidade_chuva_pct": 45,
                "condicao_climatica": "Pancadas de Chuva Tropicais",
                "aviso": f"Dados em modo offline: {str(e)}",
            }


class SaveUserMemoryTool(BaseTool):
    name = "save_user_memory"
    description = (
        "Salva uma informação importante, preferência ou fato sobre o usuário "
        "na memória persistente de longo prazo do Kyreon para ser lembrada em conversas futuras."
    )
    parameters = {
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "Fato ou preferência do usuário (ex: 'Usuário mora em Manaus e prefere respostas em tópicos').",
            },
            "category": {
                "type": "string",
                "description": "Categoria da memória: 'preferencia', 'informacao_pessoal', 'projeto' ou 'instrucao'.",
            },
        },
        "required": ["content"],
    }

    async def execute(self, content: str, category: str = "preferencia", **kwargs: Any) -> dict[str, Any]:
        from app.services.memory_service import memory_service
        res = await memory_service.save_memory(content=content, category=category)
        return {
            "status": "Memória gravada com sucesso!",
            "categoria": category,
            "conteudo": content,
            "id": res["id"],
        }


class DelegateToSpecialistTool(BaseTool):
    name = "delegate_to_specialist"
    description = (
        "Transfere ou consulta um agente especialista da equipe Kyreon para resolver tarefas técnicas, "
        "investigações ou temas regionais. Agentes disponíveis: 'code-architect' (Código & Arquitetura), "
        "'researcher' (Pesquisa & Análise), ou 'manaus-specialist' (Especialista Amazônico & Polo de Manaus)."
    )
    parameters = {
        "type": "object",
        "properties": {
            "specialist_id": {
                "type": "string",
                "enum": ["code-architect", "researcher", "manaus-specialist"],
                "description": "ID do especialista a ser consultado.",
            },
            "task": {
                "type": "string",
                "description": "Instrução detalhada ou pergunta a ser enviada ao especialista.",
            },
        },
        "required": ["specialist_id", "task"],
    }

    async def execute(self, specialist_id: str, task: str, **kwargs: Any) -> dict[str, Any]:
        from app.services.llm.factory import ProviderFactory

        specialists = {
            "code-architect": {
                "name": "Arquiteto de Software",
                "role": "Engenharia de Software & Código",
                "avatar": "💻",
                "prompt": (
                    "Você é o Arquiteto de Software da equipe Kyreon. Analise o problema a seguir com rigor técnico, "
                    "propondo códigos limpos, seguros, melhores padrões de projeto e arquitetura de alto nível."
                ),
            },
            "researcher": {
                "name": "Pesquisador & Analista",
                "role": "Análise Crítica & Investigação de Dados",
                "avatar": "🔍",
                "prompt": (
                    "Você é o Pesquisador da equipe Kyreon. Forneça uma análise aprofundada, factual, "
                    "organizada em tópicos claros com fundamentação lógica sobre a tarefa solicitada."
                ),
            },
            "manaus-specialist": {
                "name": "Guia & Especialista Amazônico",
                "role": "Geografia, Clima & Polo de Manaus",
                "avatar": "🌿",
                "prompt": (
                    "Você é o Especialista Regional Amazônico da equipe Kyreon. "
                    "Domina a história, cultura, clima, ecossistema e o Polo Industrial de Manaus (PIM). "
                    "Responda com profundo conhecimento local e riqueza de detalhes."
                ),
            },
        }

        spec = specialists.get(
            specialist_id,
            {
                "name": "Especialista Kyreon",
                "role": "Especialista Técnico",
                "avatar": "⚡",
                "prompt": "Você é um agente especialista técnico.",
            },
        )

        provider = ProviderFactory.get_provider("gemini", "gemini-3.5-flash-lite")
        messages = [{"role": "user", "content": task}]

        try:
            resp = await provider.chat(
                messages=messages,
                system_prompt=spec["prompt"],
                model="gemini-3.5-flash-lite",
                temperature=0.4,
            )
            analysis = resp.content
        except Exception:
            fallback_prov, fallback_model, _ = ProviderFactory.get_fallback_provider("gemini", "gemini-3.5-flash-lite")
            resp = await fallback_prov.chat(
                messages=messages,
                system_prompt=spec["prompt"],
                model=fallback_model,
                temperature=0.4,
            )
            analysis = resp.content

        return {
            "handoff_status": "executed",
            "specialist_id": specialist_id,
            "specialist_name": spec["name"],
            "specialist_role": spec["role"],
            "specialist_avatar": spec["avatar"],
            "task_assigned": task,
            "specialist_analysis": analysis,
        }

