import asyncio
from typing import Any, AsyncIterator
from google import genai
from google.genai import types

from app.core.config import settings
from app.services.llm.base import BaseLLMProvider, LLMResponse


class GeminiProvider(BaseLLMProvider):
    """
    Provedor Google Gemini (Gemini 2.0 Flash, Gemini 1.5 Pro, etc.)
    """

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.client = genai.Client(api_key=self.api_key)

    async def chat(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model: str,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        model_name = model or settings.GEMINI_MODEL

        # Converte mensagens para formato Gemini
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
        )

        # Executa no threadpool pois o client padrão pode ser síncrono
        response = await asyncio.to_thread(
            self.client.models.generate_content,
            model=model_name,
            contents=contents,
            config=config,
        )

        content = response.text or ""
        return LLMResponse(
            content=content,
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
        model_name = model or settings.GEMINI_MODEL

        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])]))

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
        )

        # Usando a geração de streaming
        def _get_stream():
            return self.client.models.generate_content_stream(
                model=model_name,
                contents=contents,
                config=config,
            )

        stream = await asyncio.to_thread(_get_stream)
        for chunk in stream:
            if chunk.text:
                yield chunk.text
                await asyncio.sleep(0.01)
