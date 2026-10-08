from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Kyreon AI - Agent Platform"
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./agent_platform.db"

    # LLM Providers
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_BASE_URL: str = ""

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"

    # Default provider: "gemini" | "openai" | "mock"
    DEFAULT_PROVIDER: str = "gemini"

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [
            item.strip()
            for item in self.CORS_ORIGINS.split(",")
            if item.strip()
        ]

    @property
    def active_provider(self) -> str:
        """Determina automaticamente o provedor ativo baseado nas chaves disponíveis."""
        if self.DEFAULT_PROVIDER and self.DEFAULT_PROVIDER not in ["mock", "auto"]:
            return self.DEFAULT_PROVIDER
        if self.GEMINI_API_KEY:
            return "gemini"
        if self.OPENAI_API_KEY:
            return "openai"
        return "mock"


settings = Settings()
