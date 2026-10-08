import asyncio
from typing import Any, AsyncIterator
from uuid import uuid4
from google import genai
from google.genai import types

from app.core.config import settings
from app.services.llm.base import BaseLLMProvider, LLMResponse, ToolCall


class GeminiProvider(BaseLLMProvider):
    """
    Provedor Google Gemini (Gemini 3.5 Flash Lite, etc.)
    """

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = (api_key or settings.GEMINI_API_KEY or "").strip()
        self.client = genai.Client(api_key=self.api_key)

    def _resolve_model(self, model: str | None) -> str:
        m = (model or settings.GEMINI_MODEL or "").strip()
        # Mapeia modelos descontinuados ou pro para flash-lite ativo na cota gratuita
        if not m or m in [
            "gemini-2.0-flash",
            "gemini-1.5-pro",
            "gemini-1.5-flash",
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-3.5-flash-lite",
            "gemini-pro-latest",
            "gpt-4o-mini",
            "gpt-4o",
            "mock-model",
            "auto",
        ]:
            return "gemini-flash-lite-latest"
        return m

    async def chat(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model: str,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        model_name = self._resolve_model(model)

        # Converte mensagens para formato Gemini
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))

        gemini_tools = None
        if tools:
            funcs = []
            for s in tools:
                fn = s.get("function", s)
                funcs.append(
                    types.FunctionDeclaration(
                        name=fn.get("name"),
                        description=fn.get("description", ""),
                        parameters=fn.get("parameters"),
                    )
                )
            gemini_tools = [types.Tool(function_declarations=funcs)]

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            tools=gemini_tools,
        )

        models_to_try = [model_name]
        alt_model = "gemini-flash-latest" if model_name != "gemini-flash-latest" else "gemini-flash-lite-latest"
        models_to_try.append(alt_model)

        response = None
        last_error = None
        for m in models_to_try:
            try:
                response = await asyncio.to_thread(
                    self.client.models.generate_content,
                    model=m,
                    contents=contents,
                    config=config,
                )
                model_name = m
                break
            except Exception as e:
                last_error = e
                continue

        if response is None and last_error:
            raise last_error

        tool_calls: list[ToolCall] = []
        if getattr(response, "function_calls", None):
            for fc in response.function_calls:
                args = dict(fc.args) if fc.args else {}
                tool_calls.append(
                    ToolCall(id=str(uuid4()), name=fc.name, arguments=args)
                )

        try:
            content = response.text or ""
        except Exception:
            content = ""

        return LLMResponse(
            content=content,
            tool_calls=tool_calls,
            model=model_name,
        )

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model: str,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        model_name = self._resolve_model(model)

        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
        )

        models_to_try = [model_name]
        alt_model = "gemini-flash-latest" if model_name != "gemini-flash-latest" else "gemini-flash-lite-latest"
        models_to_try.append(alt_model)

        success = False
        last_error = None
        for m in models_to_try:
            started = False
            try:
                def _get_stream(sel_model=m):
                    return self.client.models.generate_content_stream(
                        model=sel_model,
                        contents=contents,
                        config=config,
                    )

                stream = await asyncio.to_thread(_get_stream)
                for chunk in stream:
                    started = True
                    if chunk.text:
                        yield chunk.text
                        await asyncio.sleep(0.005)
                success = True
                break
            except Exception as e:
                last_error = e
                # Se o erro ocorreu antes de emitir qualquer token para o cliente, tenta o modelo alternativo
                if not started:
                    continue
                else:
                    raise e

        if not success and last_error:
            raise last_error
