from typing import Any, AsyncIterator
import json
from openai import AsyncOpenAI
from app.core.config import settings
from app.services.llm.base import BaseLLMProvider, LLMResponse, ToolCall


class OpenAIProvider(BaseLLMProvider):
    """
    Provedor OpenAI compatível com Responses API e Chat Completions com suporte a streaming e tools.
    """

    def __init__(self, api_key: str | None = None, base_url: str | None = None) -> None:
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.base_url = base_url or settings.OPENAI_BASE_URL or None
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
        )

    async def chat(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model: str,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        input_messages = [{"role": "system", "content": system_prompt}] + messages

        kwargs: dict[str, Any] = {
            "model": model or settings.OPENAI_MODEL,
            "messages": input_messages,
            "temperature": temperature,
        }

        if tools:
            kwargs["tools"] = tools

        response = await self.client.chat.completions.create(**kwargs)
        choice = response.choices[0]
        content = choice.message.content or ""

        tool_calls: list[ToolCall] = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except Exception:
                    args = {}
                tool_calls.append(
                    ToolCall(id=tc.id, name=tc.function.name, arguments=args)
                )

        usage = response.usage
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0

        return LLMResponse(
            content=content,
            tool_calls=tool_calls,
            model=response.model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model: str,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        input_messages = [{"role": "system", "content": system_prompt}] + messages

        stream = await self.client.chat.completions.create(
            model=model or settings.OPENAI_MODEL,
            messages=input_messages,
            temperature=temperature,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
