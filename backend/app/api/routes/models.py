from fastapi import APIRouter
from app.core.config import settings
from app.schemas.model import ModelInfo

router = APIRouter(prefix="/models", tags=["models"])

AVAILABLE_MODELS = [
    # OpenAI Models
    ModelInfo(
        id="gpt-4o-mini",
        name="GPT-4o Mini",
        provider="openai",
        description="Rápido, inteligente e de altíssimo custo-benefício.",
        context_window=128000,
        supports_tools=True,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-4o",
        name="GPT-4o",
        provider="openai",
        description="Modelo flagship multimodal da OpenAI de alta capacidade de raciocínio.",
        context_window=128000,
        supports_tools=True,
        supports_streaming=True,
    ),
    # Google Gemini Models
    ModelInfo(
        id="gemini-2.0-flash",
        name="Gemini 2.0 Flash",
        provider="gemini",
        description="Modelo de última geração ultra-rápido do Google DeepMind.",
        context_window=1048576,
        supports_tools=True,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gemini-1.5-pro",
        name="Gemini 1.5 Pro",
        provider="gemini",
        description="Janela de contexto massiva de 2 milhões de tokens com raciocínio complexo.",
        context_window=2097152,
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
