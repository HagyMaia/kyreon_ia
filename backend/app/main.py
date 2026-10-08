from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.agent import router as agent_router
from app.api.routes.agents import router as agents_router
from app.api.routes.conversations import router as conversations_router
from app.api.routes.health import router as health_router
from app.api.routes.models import router as models_router
from app.api.routes.tools import router as tools_router
from app.api.routes.files import router as files_router
from app.core.config import settings
from app.core.database import Base, async_session_maker, engine
from app.services.agent_service import agent_service



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicializa as tabelas no banco de dados (SQLite local ou PostgreSQL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Popula agentes padrão iniciais se não existirem
    async with async_session_maker() as session:
        await agent_service.init_default_agents(session)

    yield

    # Cleanup se necessário
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Backend completo para Plataforma de Agentes de IA.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https://.*|http://localhost:\d+|http://127\.0\.0\.1:\d+|http://192\.168\.\d+\.\d+:\d+|http://10\.\d+\.\d+\.\d+:\d+|http://172\.\d+\.\d+\.\d+:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(agent_router, prefix="/api")
app.include_router(agents_router, prefix="/api")
app.include_router(conversations_router, prefix="/api")
app.include_router(models_router, prefix="/api")
app.include_router(tools_router, prefix="/api")
app.include_router(files_router, prefix="/api")



@app.get("/")
def root():
    return {
        "name": settings.APP_NAME,
        "status": "online",
        "docs": "/docs",
        "active_provider": settings.active_provider,
    }
