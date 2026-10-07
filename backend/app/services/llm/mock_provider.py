import asyncio
from typing import Any, AsyncIterator
from app.services.llm.base import BaseLLMProvider, LLMResponse


class MockProvider(BaseLLMProvider):
    """
    Provedor Mock inteligente para desenvolvimento offline.
    Permite testar o dashboard, streaming e fluxo de agentes sem necessidade imediata de API keys.
    """

    async def chat(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model: str,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        user_message = messages[-1]["content"] if messages else ""
        content = self._generate_response(user_message, system_prompt)
        return LLMResponse(content=content, model="mock-model", prompt_tokens=25, completion_tokens=50)

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        model: str,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        user_message = messages[-1]["content"] if messages else ""
        full_text = self._generate_response(user_message, system_prompt)

        # Simula streaming fluido de tokens
        words = full_text.split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
            await asyncio.sleep(0.035)

    def _generate_response(self, user_message: str, system_prompt: str) -> str:
        prompt_snippet = system_prompt[:60].strip().replace("\n", " ")
        msg_lower = user_message.lower()

        if "olá" in msg_lower or "oi" in msg_lower:
            return (
                f"Olá! Estou pronto para ajudar. "
                f"Operando sob a persona: *'{prompt_snippet}...'*\n\n"
                f"Como posso apoiar seu projeto ou responder à sua solicitação hoje?"
            )
        elif "quem é você" in msg_lower or "o que você faz" in msg_lower:
            return (
                f"Eu sou um agente inteligente da plataforma **Kyreon AI**.\n\n"
                f"Minhas instruções principais são:\n> {system_prompt}\n\n"
                f"Posso analisar dados, resolver problemas, responder perguntas e executar ferramentas conectadas."
            )
        elif "hora" in msg_lower or "data" in msg_lower:
            from datetime import datetime
            now = datetime.now()
            return f"Hoje é {now.strftime('%d/%m/%Y')} e o horário atual é {now.strftime('%H:%M:%S')}."
        else:
            return (
                f"Compreendi a sua mensagem: *\"{user_message}\"*.\n\n"
                f"Processando com base na instrução configurada:\n"
                f"1. Analisando o contexto fornecido pelo usuário.\n"
                f"2. Aplicando as diretrizes do agente.\n"
                f"3. Gerando uma resposta estruturada e objetiva.\n\n"
                f"*(Nota do Sistema: Para ativar os modelos reais de IA como GPT-4o ou Gemini 2.0 Flash, "
                f"basta configurar a respectiva chave de API no arquivo `backend/.env` ou no painel de configurações).* "
                f"Como deseja prosseguir?"
            )
