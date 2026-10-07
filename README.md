# Kyreon AI — Agent Platform 🚀

Plataforma moderna de Agentes de IA com backend modular em **Python (FastAPI)** e frontend interativo em **React + TypeScript + Vite**.

Projetada com arquitetura desacoplada, multi-provedor de LLM (**OpenAI Responses API**, **Google Gemini** e **Mock local inteligente**), streaming em tempo real via Server-Sent Events (SSE), banco de dados com persistência de conversas e engine de ferramentas (*tools*).

---

## 🏛️ Arquitetura da Plataforma

```text
               ┌────────────────────────────────────────────────────────┐
               │              Frontend (React + Vite + TS)              │
               │   • Multi-Agentes Selector & Modal de Criação         │
               │   • Chat com Streaming SSE em tempo real               │
               │   • Histórico Persistente & Status dos Provedores      │
               └──────────────────────────┬─────────────────────────────┘
                                          │ HTTP REST & SSE
                                          ▼
               ┌────────────────────────────────────────────────────────┐
               │               FastAPI (Backend Gateway)                │
               │  /api/agent/chat/stream  │  /api/agents  │  /api/tools │
               └──────────┬───────────────────────────────┬─────────────┘
                          │                               │
            ┌─────────────┴─────────────┐   ┌─────────────┴─────────────┐
            ▼                           ▼   ▼                           ▼
  ┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
  │   Agent Engine    │       │     Database      │       │   Tools Engine    │
  │  • System Prompts │       │  • SQLite (local) │       │  • Web Search     │
  │  • Multi-Agent    │       │  • PostgreSQL     │       │  • Calculator     │
  │  • Context/Memory │       │  • Histórico/Sessão│      │  • Date & Time    │
  └─────────┬─────────┘       └───────────────────┘       └───────────────────┘
            │
            ▼
  ┌────────────────────────────────────────────────────────┐
  │                 Multi-Provider LLM                     │
  │  • OpenAI (Responses API / GPT-4o / GPT-4o-mini)       │
  │  • Google Gemini (Gemini 2.0 Flash / Gemini 1.5 Pro)   │
  │  • Mock Local (Desenvolvimento offline sem custos)     │
  └────────────────────────────────────────────────────────┘
```

---

## 📁 Estrutura de Diretórios

```text
kyreon_IA/
├── backend/
│   ├── app/
│   │   ├── api/routes/
│   │   │   ├── agent.py          # Chat síncrono e streaming SSE (/stream)
│   │   │   ├── agents.py         # CRUD de agentes personalizados
│   │   │   ├── conversations.py  # Histórico e persistência de mensagens
│   │   │   ├── models.py         # Listagem de modelos e provedores
│   │   │   ├── tools.py          # Catálogo de ferramentas ativas
│   │   │   └── health.py         # Healthcheck e diagnóstico
│   │   ├── core/
│   │   │   ├── config.py         # Configurações do ambiente e chaves
│   │   │   └── database.py       # Engine assíncrono (SQLAlchemy + aiosqlite)
│   │   ├── models/               # Modelos relacionais (Agents, Conversations, Messages)
│   │   ├── schemas/              # Validação de dados (Pydantic V2)
│   │   ├── services/
│   │   │   ├── llm/              # Provedores (OpenAI, Gemini, Mock, Factory)
│   │   │   ├── tools/            # Ferramentas nativas (Calculadora, Busca, Data)
│   │   │   ├── agent_service.py  # Orquestração do agente e streaming
│   │   │   └── conversation_service.py # Gestão do banco e mensagens
│   │   └── main.py               # Inicialização e seed automático de agentes
│   ├── tests/                    # Testes automatizados (pytest)
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.tsx       # Navegação, histórico de conversas e status
│   │   │   ├── MessageList.tsx   # Mensagens, sugestões de prompt e badges de tools
│   │   │   ├── ChatInput.tsx     # Campo com envio e suporte a Shift+Enter
│   │   │   ├── AgentModal.tsx    # Modal para criar novos agentes customizados
│   │   │   ├── AgentsView.tsx    # Painel de gerenciamento de agentes
│   │   │   └── SettingsView.tsx  # Diagnóstico dos provedores e modelos
│   │   ├── services/api.ts       # Cliente REST e leitor de SSE Stream
│   │   ├── types/index.ts        # Interfaces TypeScript
│   │   ├── App.tsx               # Orquestrador da interface
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml            # PostgreSQL 16 + Redis 7 (opcional para produção)
└── README.md
```

---

## ⚡ Como Executar Localmente

### 1. Backend (Python + FastAPI)

```bash
cd backend

# Ativar ambiente virtual:
# Windows (PowerShell):
.\.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

# Executar a API:
uvicorn app.main:app --reload --port 8000
```

- **API:** http://localhost:8000
- **Documentação Interativa (Swagger):** http://localhost:8000/docs
- **Healthcheck:** http://localhost:8000/api/health

### 2. Frontend (React + Vite)

Em outro terminal:

```bash
cd frontend
npm run dev
```

- **Painel:** http://localhost:5173

---

## 🔑 Configuração dos Provedores de IA

No arquivo `backend/.env`:

```env
# Modo automático ou específico:
DEFAULT_PROVIDER=auto

# OpenAI (Responses API / GPT-4o)
OPENAI_API_KEY=sua_chave_openai_aqui
OPENAI_MODEL=gpt-4o-mini

# Google Gemini (Gemini 2.0 Flash / Gemini 1.5)
GEMINI_API_KEY=sua_chave_gemini_aqui
GEMINI_MODEL=gemini-2.0-flash
```

> 💡 **Dica de Desenvolvimento:** Se você não configurar chaves de API imediatamente, a plataforma entra em **Modo Mock Inteligente**, permitindo testar streaming em tempo real, alternância de agentes e criação de conversas sem custos.

---

## 🧪 Executando os Testes

No diretório `backend`:

```bash
.\.venv\Scripts\pytest
```

---

## 🗺️ Roadmap de Evoluções da Plataforma

- [x] **Arquitetura Multi-Provedor:** OpenAI Responses API, Google Gemini e Mock local
- [x] **Streaming em Tempo Real:** Server-Sent Events (SSE) com digitação fluida
- [x] **Gestão de Agentes:** Criar, editar, configurar prompts e modelos específicos
- [x] **Persistência de Sessões:** Histórico de conversas gravado no banco de dados
- [x] **Ferramentas Nativas (Tools):** Execução de data/hora, calculadora e busca web
- [ ] **Módulo RAG / Base de Conhecimento:** Upload de PDFs/Docs com vetores (pgvector / Chroma)
- [ ] **Autenticação & Multi-Usuário:** Login com JWT e permissões por perfil
- [ ] **Filas & Tarefas Assíncronas:** Redis + Celery/ARQ para agentes autônomos de longa duração
