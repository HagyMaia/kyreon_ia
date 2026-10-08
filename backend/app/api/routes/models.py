from fastapi import APIRouter
from app.core.config import settings
from app.schemas.model import ModelInfo

router = APIRouter(prefix="/models", tags=["models"])

AVAILABLE_MODELS = [
    # Google Gemini Models (Ativos com cota gratuita)
    ModelInfo(
        id="gemini-3.5-flash-lite",
        name="Gemini 3.5 Flash Lite (Recomendado)",
        provider="gemini",
        description="Ultra-rápido, inteligente e com cota gratuita ativa pelo Google AI Studio.",
        context_window=1048576,
        supports_tools=True,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gemini-flash-lite-latest",
        name="Gemini Flash Lite (Latest)",
        provider="gemini",
        description="Versão mais recente e leve da família Gemini.",
        context_window=1048576,
        supports_tools=True,
        supports_streaming=True,
    ),
    # OpenAI Models
    ModelInfo(
        id="gpt-4o-mini",
        name="GPT-4o Mini (OpenAI)",
        provider="openai",
        description="Rápido e inteligente (requer saldo pré-pago de créditos na conta OpenAI).",
        context_window=128000,
        supports_tools=True,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-4o",
        name="GPT-4o (OpenAI)",
        provider="openai",
        description="Modelo flagship avançado (requer saldo pré-pago de créditos na conta OpenAI).",
        context_window=128000,
        supports_tools=True,
        supports_streaming=True,
    ),
    # Mock Provider
    ModelInfo(
        id="mock-model",
        name="Mock Simulado (Offline)",
        provider="mock",
        description="Modo local inteligente sem custos para desenvolvimento e testes de UI.",
        context_window=8192,
        supports_tools=True,
        supports_streaming=True,
    ),
]


@router.get("", response_model=list[ModelInfo])
async def list_models():
    return AVAILABLE_MODELS


@router.get("/status")
async def get_providers_status():
    return {
        "active_provider": settings.active_provider,
        "openai_configured": bool(settings.OPENAI_API_KEY),
        "gemini_configured": bool(settings.GEMINI_API_KEY),
    }
