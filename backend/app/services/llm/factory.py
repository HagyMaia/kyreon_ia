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
            return MockProvider()

        # Provedor Google Gemini
        if provider == "gemini":
            if settings.GEMINI_API_KEY:
                return GeminiProvider()
            return MockProvider()

        # Mock ou fallback padrão
        return MockProvider()
