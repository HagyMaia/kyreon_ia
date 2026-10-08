from app.core.config import settings
from app.services.llm.base import BaseLLMProvider
from app.services.llm.gemini_provider import GeminiProvider
from app.services.llm.mock_provider import MockProvider
from app.services.llm.openai_provider import OpenAIProvider


class ProviderFactory:
    @staticmethod
    def get_provider(
        provider_name: str | None = None,
        model_name: str | None = None,
    ) -> BaseLLMProvider:
        provider = (provider_name or "auto").lower()
        model = (model_name or "").lower()

        # Determina provedor automático se for auto
        if provider == "auto":
            if model.startswith("gemini"):
                provider = "gemini"
            elif model.startswith("gpt") or model.startswith("o1") or model.startswith("o3"):
                provider = "openai"
            else:
                provider = settings.active_provider

        # Provedor OpenAI
        if provider == "openai":
            if settings.OPENAI_API_KEY:
                return OpenAIProvider()
            if settings.GEMINI_API_KEY:
                return GeminiProvider()
            return MockProvider()

        # Provedor Google Gemini
        if provider == "gemini":
            if settings.GEMINI_API_KEY:
                return GeminiProvider()
            return MockProvider()

        # Mock ou fallback padrão
        return MockProvider()

    @staticmethod
    def get_fallback_provider(
        failed_provider_name: str | None = None,
        model_name: str | None = None,
    ) -> tuple[BaseLLMProvider, str, str]:
        """
        Retorna um provedor alternativo resiliente quando o provedor primário falha (ex: cota 429 esgotada).
        Retorna (provedor_reserva, modelo_reserva, aviso_formatado).
        """
        failed = (failed_provider_name or "").lower()
        model = (model_name or "").lower()

        # Se falhou OpenAI e temos Gemini ativo
        if ("openai" in failed or "gpt" in model or "o1" in model or "o3" in model) and settings.GEMINI_API_KEY:
            return (
                GeminiProvider(),
                "gemini-3.5-flash-lite",
                "> ⚠️ *Aviso: Cota da OpenAI sem créditos no momento (Erro 429). Alternando automaticamente para o **Google Gemini (Gemini 3.5 Flash Lite)**...*\n\n",
            )

        # Fallback universal para Mock inteligente local
        return (
            MockProvider(),
            "mock-model",
            "> ⚠️ *Aviso: Provedor online temporariamente indisponível. Respondendo através do **Modo de Desenvolvimento Inteligente (Offline)**...*\n\n",
        )
