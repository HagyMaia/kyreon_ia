def test_list_agents(client):
    # Deve carregar os agentes padrão na inicialização
    response = client.get("/api/agents")
    assert response.status_code == 200
    agents = response.json()
    assert len(agents) >= 3
    agent_names = [a["name"] for a in agents]
    assert "Kyreon Orquestrador & Assistente" in agent_names


def test_create_and_delete_custom_agent(client):
    new_agent_payload = {
        "name": "Agente Teste",
        "role": "Especialista em Testes",
        "description": "Agente criado para testar a API",
        "system_prompt": "Você é um agente de testes.",
        "provider": "mock",
        "model": "mock-model",
        "temperature": 0.5,
        "tools": ["calculator"],
        "avatar": "🧪",
        "is_default": False,
    }
    create_res = client.post("/api/agents", json=new_agent_payload)
    assert create_res.status_code == 201
    created = create_res.json()
    agent_id = created["id"]
    assert created["name"] == "Agente Teste"

    # Deleta agente
    del_res = client.delete(f"/api/agents/{agent_id}")
    assert del_res.status_code == 204


def test_chat_mock(client):
    payload = {
        "message": "Olá agente!",
        "agent_id": "default-assistant",
        "history": [],
    }
    response = client.post("/api/agent/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "conversation_id" in data
    assert len(data["content"]) > 0


def test_conversations_flow(client):
    # Faz chat para gerar histórico
    chat_payload = {
        "message": "Qual é a sua missão?",
        "agent_id": "default-assistant",
    }
    chat_res = client.post("/api/agent/chat", json=chat_payload)
    conv_id = chat_res.json()["conversation_id"]

    # Consulta conversa
    get_res = client.get(f"/api/conversations/{conv_id}")
    assert get_res.status_code == 200
    conv_data = get_res.json()
    assert len(conv_data["messages"]) >= 2  # user + assistant
