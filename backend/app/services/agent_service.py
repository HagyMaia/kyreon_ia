import json
from typing import AsyncIterator
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import AgentModel
from app.schemas.agent import (
    AgentChatRequest,
    AgentChatResponse,
    AgentCreate,
    AgentRead,
    AgentUpdate,
)
from app.services.conversation_service import conversation_service
from app.services.llm.factory import ProviderFactory
from app.services.memory_service import memory_service
from app.services.tools.registry import tool_registry

DEFAULT_AGENTS = [
    {
        "id": "default-assistant",
        "name": "Kyreon Orquestrador & Assistente",
        "role": "Orquestrador Central & IA Geral",
        "description": "Orquestrador da plataforma Kyreon. Responde a dúvidas gerais, consulta clima de Manaus, salva preferências na memória e delega tarefas técnicas para especialistas.",
        "system_prompt": (
            "Você é o Kyreon, assistente de IA e Orquestrador Central da plataforma Kyreon AI.\n"
            "Você tem ferramentas especializadas à sua disposição:\n"
            "- 'get_manaus_weather': para consultar temperatura, chuva e clima de Manaus - Amazonas em tempo real;\n"
            "- 'save_user_memory': para gravar preferências, nome e fatos do usuário que ele queira que você lembre;\n"
            "- 'delegate_to_specialist': você lidera uma equipe de especialistas: 'code-architect' (para código e arquitetura), "
            "'researcher' (para investigações e relatórios) e 'manaus-specialist' (para cultura, clima e Polo Industrial de Manaus). "
            "Quando a pergunta exigir análise aprofundada nesses tópicos, você pode consultar o especialista correspondente para enriquecer sua resposta!\n"
            "Responda sempre em português do Brasil com formatação markdown rica, clara e objetiva."
        ),
        "provider": "gemini",
        "model": "gemini-3.5-flash-lite",
        "temperature": 0.7,
        "tools": [
            "get_current_datetime",
            "calculator",
            "web_search",
            "get_manaus_weather",
            "save_user_memory",
            "delegate_to_specialist",
        ],
        "avatar": "✦",
        "is_default": True,
    },
    {
        "id": "code-architect",
        "name": "Arquiteto de Software",
        "role": "Especialista em Engenharia & Código",
        "description": "Focado em desenvolvimento de software, arquitetura de sistemas, Python, TypeScript e boas práticas.",
        "system_prompt": (
            "Você é um Engenheiro de Software Sênior e Arquiteto de Soluções experiente da equipe Kyreon. "
            "Forneça códigos robustos, seguros, modernos e com padrões de projeto limpos. "
            "Ao sugerir código, explique as decisões técnicas e use blocos markdown com destaque de sintaxe."
        ),
        "provider": "gemini",
        "model": "gemini-3.5-flash-lite",
        "temperature": 0.3,
        "tools": ["calculator", "get_current_datetime", "web_search"],
        "avatar": "💻",
        "is_default": False,
    },
    {
        "id": "researcher",
        "name": "Pesquisador & Analista",
        "role": "Análise Crítica & Síntese de Dados",
        "description": "Especializado em investigação detalhada, busca de dados e relatórios fundamentados.",
        "system_prompt": (
            "Você é um pesquisador e analista analítico da equipe Kyreon. "
            "Sua missão é detalhar informações de forma factual, lógica e sem alucinações. "
            "Use bullet points e cite fontes ou passos de verificação sempre que possível."
        ),
        "provider": "gemini",
        "model": "gemini-3.5-flash-lite",
        "temperature": 0.4,
        "tools": ["web_search", "get_current_datetime"],
        "avatar": "🔍",
        "is_default": False,
    },
    {
        "id": "manaus-specialist",
        "name": "Guia & Especialista Amazônico",
        "role": "Geografia, Clima & Polo de Manaus",
        "description": "Especialista regional em Manaus, ecossistema amazônico, clima, história, Polo Industrial (PIM) e cultura local.",
        "system_prompt": (
            "Você é o Especialista Regional Amazônico da equipe Kyreon. "
            "Domina a história, cultura cabocla e indígena, clima tropical, Polo Industrial de Manaus (PIM), "
            "economia da Zona Franca e biodiversidade da Amazônia. Responda com profundo conhecimento local."
        ),
        "provider": "gemini",
        "model": "gemini-3.5-flash-lite",
        "temperature": 0.5,
        "tools": ["get_manaus_weather", "get_current_datetime", "web_search"],
        "avatar": "🌿",
        "is_default": False,
    },
]


class AgentService:
    async def init_default_agents(self, db: AsyncSession) -> None:
        """Inicializa ou atualiza os agentes padrão no banco de dados."""
        for agent_def in DEFAULT_AGENTS:
            query = select(AgentModel).where(AgentModel.id == agent_def["id"])
            result = await db.execute(query)
            existing = result.scalar_one_or_none()
            if not existing:
                agent = AgentModel(
                    id=agent_def["id"],
                    name=agent_def["name"],
                    role=agent_def["role"],
                    description=agent_def["description"],
                    system_prompt=agent_def["system_prompt"],
                    provider=agent_def["provider"],
                    model=agent_def["model"],
                    temperature=agent_def["temperature"],
                    tools=json.dumps(agent_def["tools"]),
                    avatar=agent_def["avatar"],
                    is_default=agent_def["is_default"],
                )
                db.add(agent)
            else:
                existing.name = agent_def["name"]
                existing.role = agent_def["role"]
                existing.description = agent_def["description"]
                existing.system_prompt = agent_def["system_prompt"]
                existing.provider = agent_def["provider"]
                existing.model = agent_def["model"]
                existing.temperature = agent_def["temperature"]
                existing.tools = json.dumps(agent_def["tools"])
                existing.avatar = agent_def["avatar"]
                existing.is_default = agent_def["is_default"]
        await db.commit()


    async def list_agents(self, db: AsyncSession) -> list[AgentRead]:
        query = select(AgentModel).order_by(AgentModel.created_at)
        result = await db.execute(query)
        agents = result.scalars().all()
        return [
            AgentRead(
                id=a.id,
                name=a.name,
                role=a.role,
                description=a.description,
                system_prompt=a.system_prompt,
                provider=a.provider,
                model=a.model,
                temperature=a.temperature,
                tools=a.tools_list,
                avatar=a.avatar,
                is_default=a.is_default,
                created_at=a.created_at,
                updated_at=a.updated_at,
            )
            for a in agents
        ]

    async def get_agent(self, db: AsyncSession, agent_id: str) -> AgentModel | None:
        query = select(AgentModel).where(AgentModel.id == agent_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def create_agent(self, db: AsyncSession, data: AgentCreate) -> AgentRead:
        agent_id = str(uuid4())
        agent = AgentModel(
            id=agent_id,
            name=data.name,
            role=data.role,
            description=data.description,
            system_prompt=data.system_prompt,
            provider=data.provider,
            model=data.model,
            temperature=data.temperature,
            tools=json.dumps(data.tools),
            avatar=data.avatar,
            is_default=data.is_default,
        )
        db.add(agent)
        await db.commit()
        await db.refresh(agent)
        return AgentRead(
            id=agent.id,
            name=agent.name,
            role=agent.role,
            description=agent.description,
            system_prompt=agent.system_prompt,
            provider=agent.provider,
            model=agent.model,
            temperature=agent.temperature,
            tools=agent.tools_list,
            avatar=agent.avatar,
            is_default=agent.is_default,
            created_at=agent.created_at,
            updated_at=agent.updated_at,
        )

    async def update_agent(self, db: AsyncSession, agent_id: str, data: AgentUpdate) -> AgentRead | None:
        agent = await self.get_agent(db, agent_id)
        if not agent:
            return None

        update_data = data.model_dump(exclude_unset=True)
        if "tools" in update_data and update_data["tools"] is not None:
            agent.tools = json.dumps(update_data.pop("tools"))

        for key, value in update_data.items():
            setattr(agent, key, value)

        await db.commit()
        await db.refresh(agent)
        return AgentRead(
            id=agent.id,
            name=agent.name,
            role=agent.role,
            description=agent.description,
            system_prompt=agent.system_prompt,
            provider=agent.provider,
            model=agent.model,
            temperature=agent.temperature,
            tools=agent.tools_list,
            avatar=agent.avatar,
            is_default=agent.is_default,
            created_at=agent.created_at,
            updated_at=agent.updated_at,
        )

    async def delete_agent(self, db: AsyncSession, agent_id: str) -> bool:
        agent = await self.get_agent(db, agent_id)
        if not agent:
            return False
        await db.delete(agent)
        await db.commit()
        return True

    async def chat(self, db: AsyncSession, request: AgentChatRequest) -> AgentChatResponse:
        # Recupera agente
        agent_id = request.agent_id or "default-assistant"
        agent = await self.get_agent(db, agent_id)
        if not agent:
            # Fallback para o primeiro agente disponível
            agents = await self.list_agents(db)
            agent = agents[0] if agents else None

        system_prompt = (
            agent.system_prompt
            if agent
            else "Você é um agente de IA útil e objetivo."
        )
        provider_name = agent.provider if agent else "auto"
        model_name = agent.model if agent else "gpt-4o-mini"
        temperature = agent.temperature if agent else 0.7
        tools_list = agent.tools_list if agent else []

        # Obtém ou cria conversa
        conversation_title = request.message[:30] + ("..." if len(request.message) > 30 else "")
        conversation = await conversation_service.get_or_create_conversation(
            db,
            conversation_id=request.conversation_id,
            title=conversation_title,
            agent_id=agent_id,
        )

        # Salva mensagem do usuário
        await conversation_service.add_message(
            db,
            conversation_id=conversation.id,
            role="user",
            content=request.message,
        )

        # Monta histórico para o LLM
        messages = [{"role": msg.role, "content": msg.content} for msg in request.history]
        messages.append({"role": "user", "content": request.message})

        # Injeta memórias de longo prazo salvas
        try:
            memories = await memory_service.list_memories(db)
            if memories:
                mem_lines = "\n".join([f"- [{m['category'].upper()}] {m['content']}" for m in memories[:15]])
                system_prompt += f"\n\n[MEMÓRIA DE LONGO PRAZO PERSISTIDA DO USUÁRIO]:\n{mem_lines}\n(Considere estas informações personalizadas ao formular sua resposta)."
        except Exception:
            pass

        # Prepara ferramentas
        tools_schemas = tool_registry.get_schemas_for_tools(tools_list)

        # Executa chamada ao provedor com fallback resiliente
        provider = ProviderFactory.get_provider(provider_name, model_name)
        try:
            response = await provider.chat(
                messages=messages,
                system_prompt=system_prompt,
                model=model_name,
                temperature=temperature,
                tools=tools_schemas if tools_schemas else None,
            )
        except Exception:
            fallback_prov, fallback_model, notice = ProviderFactory.get_fallback_provider(provider_name, model_name)
            response = await fallback_prov.chat(
                messages=messages,
                system_prompt=system_prompt,
                model=fallback_model,
                temperature=temperature,
                tools=tools_schemas if tools_schemas else None,
            )
            response.content = notice + response.content

        # Trata execução de ferramentas se houver
        tool_results_info = []
        synthesized_parts = []
        if response.tool_calls:
            for tc in response.tool_calls:
                res = await tool_registry.execute_tool(tc.name, tc.arguments)
                tool_results_info.append({"tool": tc.name, "arguments": tc.arguments, "result": res})

                if tc.name == "delegate_to_specialist" and isinstance(res, dict):
                    spec_name = res.get("specialist_name", "Especialista")
                    spec_role = res.get("specialist_role", "")
                    spec_avatar = res.get("specialist_avatar", "🤖")
                    spec_resp = res.get("response", "")
                    synthesized_parts.append(
                        f"### {spec_avatar} Análise do {spec_name} ({spec_role})\n\n{spec_resp}"
                    )
                elif tc.name == "get_manaus_weather" and isinstance(res, dict):
                    temp = res.get("temperatura_c")
                    rain_prob = res.get("probabilidade_chuva_pct")
                    cond = res.get("condicao_climatica")
                    advice = res.get("conselho_regional")
                    humidity = res.get("umidade_relativa_pct")
                    synthesized_parts.append(
                        f"🌤️ **Clima em Manaus - AM agora:**\n"
                        f"- **Temperatura:** {temp}°C (Sensação: {res.get('sensacao_termica_c', temp)}°C)\n"
                        f"- **Condição:** {cond}\n"
                        f"- **Probabilidade de Chuva:** {rain_prob}%\n"
                        f"- **Umidade do Ar:** {humidity}%\n\n"
                        f"💡 *Dica regional:* {advice}"
                    )
                elif tc.name == "save_user_memory" and isinstance(res, dict):
                    synthesized_parts.append(
                        f"💾 **Memória gravada com sucesso!**\n"
                        f"> *\"{res.get('conteudo')}\"* (Categoria: `{res.get('categoria')}`)\n\n"
                        f"Kyreon guardou essa informação na memória persistente para todas as próximas conversas."
                    )

        final_content = (response.content or "").strip()
        if synthesized_parts:
            tool_text = "\n\n".join(synthesized_parts)
            if final_content:
                final_content = f"{final_content}\n\n{tool_text}"
            else:
                final_content = tool_text
        elif not final_content:
            final_content = "Ação executada com sucesso pelo agente."

        # Salva mensagem do assistente
        msg_record = await conversation_service.add_message(
            db,
            conversation_id=conversation.id,
            role="assistant",
            content=final_content,
            tool_calls=tool_results_info,
        )

        return AgentChatResponse(
            conversation_id=conversation.id,
            message_id=msg_record.id,
            agent_id=agent.id if agent else None,
            content=final_content,
            tool_calls=tool_results_info,
        )

    async def chat_stream(
        self,
        db: AsyncSession,
        request: AgentChatRequest,
    ) -> AsyncIterator[str]:
        """Gera eventos SSE de streaming para o cliente com recuperação automática de falha."""
        agent_id = request.agent_id or "default-assistant"
        agent = await self.get_agent(db, agent_id)

        system_prompt = (
            agent.system_prompt
            if agent
            else "Você é um agente de IA útil e objetivo."
        )
        provider_name = agent.provider if agent else "gemini"
        model_name = agent.model if agent else "gemini-3.5-flash-lite"
        temperature = agent.temperature if agent else 0.7

        # Injeta memórias de longo prazo salvas
        try:
            memories = await memory_service.list_memories(db)
            if memories:
                mem_lines = "\n".join([f"- [{m['category'].upper()}] {m['content']}" for m in memories[:15]])
                system_prompt += f"\n\n[MEMÓRIA DE LONGO PRAZO PERSISTIDA DO USUÁRIO]:\n{mem_lines}\n(Considere estas informações personalizadas ao formular sua resposta)."
        except Exception:
            pass

        # Registra conversa e mensagem do usuário
        conversation_title = request.message[:30] + ("..." if len(request.message) > 30 else "")
        conversation = await conversation_service.get_or_create_conversation(
            db,
            conversation_id=request.conversation_id,
            title=conversation_title,
            agent_id=agent_id,
        )

        await conversation_service.add_message(
            db,
            conversation_id=conversation.id,
            role="user",
            content=request.message,
        )

        # Notifica início com ID da conversa
        yield f"data: {json.dumps({'type': 'start', 'conversation_id': conversation.id, 'agent_id': agent_id})}\n\n"

        messages = [{"role": msg.role, "content": msg.content} for msg in request.history]
        messages.append({"role": "user", "content": request.message})

        provider = ProviderFactory.get_provider(provider_name, model_name)
        full_content = []

        try:
            async for token in provider.chat_stream(
                messages=messages,
                system_prompt=system_prompt,
                model=model_name,
                temperature=temperature,
            ):
                full_content.append(token)
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
        except Exception:
            # Fallback automático resiliente quando o provedor principal falhar (ex: OpenAI 429 quota esgotada)
            fallback_prov, fallback_model, notice = ProviderFactory.get_fallback_provider(provider_name, model_name)
            full_content.append(notice)
            yield f"data: {json.dumps({'type': 'token', 'token': notice})}\n\n"
            try:
                async for token in fallback_prov.chat_stream(
                    messages=messages,
                    system_prompt=system_prompt,
                    model=fallback_model,
                    temperature=temperature,
                ):
                    full_content.append(token)
                    yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
            except Exception as e2:
                error_msg = f"\n[Erro durante execução do modelo reserva: {str(e2)}]"
                full_content.append(error_msg)
                yield f"data: {json.dumps({'type': 'token', 'token': error_msg})}\n\n"

        final_text = "".join(full_content)

        # Salva resposta do assistente no banco
        await conversation_service.add_message(
            db,
            conversation_id=conversation.id,
            role="assistant",
            content=final_text,
        )

        yield f"data: {json.dumps({'type': 'done', 'conversation_id': conversation.id, 'content': final_text})}\n\n"


agent_service = AgentService()
