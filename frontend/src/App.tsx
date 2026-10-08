import { useEffect, useState } from "react";
import { ChevronDown, Plus, Sparkles, Bot, Menu } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { MessageList } from "./components/MessageList";
import { ChatInput } from "./components/ChatInput";
import { AgentModal } from "./components/AgentModal";
import { AgentsView } from "./components/AgentsView";
import { SettingsView } from "./components/SettingsView";
import { ThemeToggle } from "./components/ThemeToggle";
import { WeatherFloatingWidget } from "./components/WeatherFloatingWidget";
import { VoiceConversationModal } from "./components/VoiceConversationModal";
import {
  createAgent,
  updateAgent,
  deleteAgent,
  deleteConversation,
  fetchAgents,
  fetchConversation,
  fetchConversations,
  fetchHealth,
  fetchModels,
  fetchTools,
  getApiBaseUrl,
  sendMessage,
  streamMessage,
} from "./services/api";
import type {
  Agent,
  AgentCreateInput,
  AgentUpdateInput,
  ChatStatus,
  Conversation,
  Message,
  ModelInfo,
  SystemHealth,
  ToolInfo,
} from "./types";

export default function App() {
  const [activeView, setActiveView] = useState<"chat" | "agents" | "settings">("chat");

  // Modo Claro e Escuro persistente
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("kyreon_theme");
    return saved === "light" || saved === "dark" ? saved : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("kyreon_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // Dados do Sistema
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);

  // Estado do Chat e Ciclo de Vida da IA
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [chatStatus, setChatStatus] = useState<ChatStatus>("idle");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [thinkingMode, setThinkingMode] = useState(false);

  // Modais e Menu Mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  // Monitoramento de Conectividade de Rede (Online / Offline / Reconexão)
  useEffect(() => {
    function handleOnline() {
      setChatStatus("reconnecting");
      fetchHealth()
        .then((h) => {
          setHealth(h);
          setChatStatus("idle");
        })
        .catch(() => {
          setChatStatus("idle");
        });
    }

    function handleOffline() {
      setChatStatus("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setChatStatus("offline");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Carrega dados iniciais
  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const [agentsData, convsData, modelsData, toolsData, healthData] =
        await Promise.all([
          fetchAgents().catch(() => []),
          fetchConversations().catch(() => []),
          fetchModels().catch(() => []),
          fetchTools().catch(() => []),
          fetchHealth().catch(() => null),
        ]);

      setAgents(agentsData);
      if (agentsData.length > 0) {
        const defaultAgent = agentsData.find((a) => a.is_default) || agentsData[0];
        setActiveAgent(defaultAgent);
      }
      setConversations(convsData);
      setModels(modelsData);
      setTools(toolsData);
      setHealth(healthData);
    } catch (err) {
      console.error("Erro ao carregar dados da plataforma:", err);
    }
  }

  async function reloadConversations() {
    try {
      const convs = await fetchConversations();
      setConversations(convs);
    } catch (err) {
      console.error("Erro ao atualizar conversas:", err);
    }
  }

  function handleNewChat() {
    setMessages([]);
    setConversationId(undefined);
    setActiveView("chat");
  }

  async function handleSelectConversation(id: string) {
    try {
      setLoading(true);
      const convDetail = await fetchConversation(id);
      setConversationId(convDetail.id);
      setMessages(convDetail.messages || []);

      if (convDetail.agent_id) {
        const found = agents.find((a) => a.id === convDetail.agent_id);
        if (found) setActiveAgent(found);
      }
      setActiveView("chat");
    } catch (err) {
      console.error("Erro ao carregar conversa:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        handleNewChat();
      }
    } catch (err) {
      console.error("Erro ao excluir conversa:", err);
    }
  }

  async function handleSaveAgent(data: AgentCreateInput) {
    try {
      if (editingAgent) {
        const updated = await updateAgent(editingAgent.id, data);
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        if (activeAgent?.id === updated.id) {
          setActiveAgent(updated);
        }
        setEditingAgent(null);
      } else {
        const created = await createAgent(data);
        setAgents((prev) => [...prev, created]);
        setActiveAgent(created);
        handleNewChat();
      }
    } catch (err: any) {
      console.error("Erro ao salvar agente:", err);
      alert(`Erro ao salvar agente: ${err.message || "Tente novamente"}`);
      throw err;
    }
  }

  async function handleDeleteAgent(agentId: string) {
    if (!confirm("Tem certeza que deseja excluir este agente?")) return;
    try {
      await deleteAgent(agentId);
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
      if (activeAgent?.id === agentId) {
        const remaining = agents.filter((a) => a.id !== agentId);
        setActiveAgent(remaining[0]);
      }
    } catch (err) {
      console.error("Erro ao excluir agente:", err);
    }
  }

  function handleSelectAgentFromView(agent: Agent) {
    setActiveAgent(agent);
    handleNewChat();
  }

  async function handleSend(content: string): Promise<string | void> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setChatStatus("offline");
      const offlineMsg =
        "⚠️ Você está sem conexão com a internet. Verifique sua rede para conversar com o Kyreon.";
      setMessages((current) => [
        ...current,
        { role: "assistant", content: offlineMsg },
      ]);
      return offlineMsg;
    }

    const promptToSend =
      thinkingMode && !content.startsWith("[MODO PENSAR]")
        ? `[MODO PENSAR ATIVADO: Analise detalhadamente com raciocínio profundo passo a passo antes de responder]\n\n${content}`
        : content;

    const userMessage: Message = { role: "user", content };
    const history = [...messages];

    setMessages((current) => [...current, userMessage]);
    setLoading(true);
    setChatStatus("sending");

    const hasTools = activeAgent?.tools && activeAgent.tools.length > 0;

    // Se o agente possui ferramentas (ex: Kyreon Orquestrador), usa chamada com orquestração de tools e handoff
    if (hasTools) {
      setChatStatus("processing");
      const assistantIndex = messages.length + 1;
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "⚡ Kyreon está processando e orquestrando as ferramentas...",
        },
      ]);

      try {
        const result = await sendMessage(
          promptToSend,
          history,
          conversationId,
          activeAgent?.id
        );
        setConversationId(result.conversation_id);
        setMessages((current) => {
          const updated = [...current];
          updated[assistantIndex] = {
            role: "assistant",
            content: result.content,
            tool_calls: result.tool_calls,
          };
          return updated;
        });
        reloadConversations();
        setChatStatus("success");
        setTimeout(() => setChatStatus("idle"), 2000);
        return result.content;
      } catch (err: any) {
        console.error("[Kyreon Chat Error]:", err);
        setChatStatus("error");
        const errorMsg = `⚠️ Falha ao processar solicitação: ${err.message || "Erro de conexão"}`;
        setMessages((current) => {
          const updated = [...current];
          updated[assistantIndex] = {
            role: "assistant",
            content: errorMsg,
          };
          return updated;
        });
        setTimeout(() => setChatStatus("idle"), 4000);
        return errorMsg;
      } finally {
        setLoading(false);
      }
    }

    // Para agentes sem ferramentas, streaming contínuo em tempo real
    const assistantIndex = messages.length + 1;
    let accumulatedContent = "";
    setChatStatus("processing");

    try {
      // Tenta streaming SSE em tempo real
      await streamMessage(
        promptToSend,
        history,
        conversationId,
        activeAgent?.id,
        {
          onStart: (data) => {
            setConversationId(data.conversation_id);
            setChatStatus("responding");
          },
          onToken: (token) => {
            setChatStatus("responding");
            accumulatedContent += token;
            setMessages((current) => {
              const updated = [...current];
              if (updated[assistantIndex]) {
                updated[assistantIndex] = {
                  ...updated[assistantIndex],
                  content: accumulatedContent,
                };
              } else {
                updated.push({
                  role: "assistant",
                  content: accumulatedContent,
                });
              }
              return updated;
            });
          },
          onDone: (data) => {
            setConversationId(data.conversation_id);
            reloadConversations();
            setChatStatus("success");
            setTimeout(() => setChatStatus("idle"), 2000);
          },
        }
      );
      return accumulatedContent;
    } catch (streamErr) {
      console.warn("Falha no streaming, tentando fallback síncrono:", streamErr);
      try {
        setChatStatus("processing");
        const result = await sendMessage(
          promptToSend,
          history,
          conversationId,
          activeAgent?.id
        );
        setConversationId(result.conversation_id);
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: result.content,
            tool_calls: result.tool_calls,
          },
        ]);
        reloadConversations();
        setChatStatus("success");
        setTimeout(() => setChatStatus("idle"), 2000);
        return result.content;
      } catch (fallbackErr: any) {
        console.error("[Kyreon Fallback Error]:", fallbackErr);
        setChatStatus("error");
        const fallbackMsg =
          `⚠️ Não foi possível conectar ao agente em: ${getApiBaseUrl()}.\n\n` +
          `• Para iniciar o backend localmente: dê um duplo clique no arquivo 'iniciar_local.bat' ou execute 'uvicorn app.main:app' na pasta backend.\n` +
          `• Se estiver usando a Vercel: configure o endpoint do backend nas Configurações da plataforma.`;
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: fallbackMsg,
          },
        ]);
        setTimeout(() => setChatStatus("idle"), 5000);
        return fallbackMsg;
      }
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: ChatStatus) {
    switch (status) {
      case "sending":
        return { dotClass: "status-dot-sending", label: "Enviando..." };
      case "processing":
        return { dotClass: "status-dot-processing", label: "Kyreon pensando..." };
      case "responding":
        return { dotClass: "status-dot-responding", label: "Gerando resposta..." };
      case "success":
        return { dotClass: "status-dot-success", label: "Concluído" };
      case "error":
        return { dotClass: "status-dot-error", label: "Falha na resposta" };
      case "offline":
        return { dotClass: "status-dot-offline", label: "Offline" };
      case "reconnecting":
        return { dotClass: "status-dot-reconnecting", label: "Reconectando..." };
      case "idle":
      default:
        return { dotClass: "status-dot-active", label: "Agente online" };
    }
  }

  const statusBadge = getStatusBadge(chatStatus);

  return (
    <div className="app">
      {/* Backdrop para fechar o menu no mobile */}
      {isSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        onNewChat={handleNewChat}
        activeView={activeView}
        onChangeView={setActiveView}
        conversations={conversations}
        activeConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        health={health}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setIsSidebarOpen(true)}
              title="Abrir menu lateral"
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <span className={`status-dot ${statusBadge.dotClass}`} />
            <span className="status-label">{statusBadge.label}</span>
          </div>

          <div className="topbar-right">
            {/* Alternador de Modo Claro / Escuro */}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />

            {/* Seletor de Agente Ativo */}
            <div className="agent-selector-wrapper">
              <select
                className="agent-select"
                aria-label="Selecionar agente ativo"
                value={activeAgent?.id || ""}
                onChange={(e) => {
                  const sel = agents.find((a) => a.id === e.target.value);
                  if (sel) setActiveAgent(sel);
                }}
              >
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.avatar} {ag.name} ({ag.role})
                  </option>
                ))}
              </select>
            </div>

            <button
              className="btn-create-agent-header"
              onClick={() => {
                setEditingAgent(null);
                setIsAgentModalOpen(true);
              }}
              title="Criar novo agente"
              aria-label="Criar novo agente"
            >
              <Plus size={15} />
              <span className="btn-create-label">Novo Agente</span>
            </button>
          </div>
        </header>

        {/* Banner de Status de Rede Offline / Reconectando */}
        {chatStatus === "offline" && (
          <div className="network-status-banner offline" role="alert">
            <span>⚠️ Sem conexão com a internet. As respostas da IA requerem conexão de rede.</span>
          </div>
        )}
        {chatStatus === "reconnecting" && (
          <div className="network-status-banner reconnecting" role="status">
            <span>🔄 Conexão restabelecida. Reconectando aos serviços do Kyreon...</span>
          </div>
        )}

        {/* Conteúdo Dinâmico por View */}
        {activeView === "chat" && (
          <section className="workspace">
            <MessageList
              messages={messages}
              activeAgent={activeAgent}
              userName="Hagy"
              autoSpeak={autoSpeak}
            />

            {loading && !messages.some((m) => m.role === "assistant" && m.content) && (
              <div className="typing" role="status" aria-live="polite">
                <span /> <span /> <span />
                {chatStatus === "processing"
                  ? "Kyreon está pensando..."
                  : chatStatus === "responding"
                  ? "Gerando resposta..."
                  : "Processando..."}
              </div>
            )}

            <div className="composer-area">
              <ChatInput
                loading={loading}
                onSend={handleSend}
                placeholder={
                  chatStatus === "offline"
                    ? "Offline - conecte-se à internet..."
                    : activeAgent
                    ? `Pergunte ao ${activeAgent.name}...`
                    : "Pergunte qualquer coisa"
                }
                autoSpeak={autoSpeak}
                onToggleAutoSpeak={() => setAutoSpeak((prev) => !prev)}
                thinkingMode={thinkingMode}
                onToggleThinkingMode={() => setThinkingMode((prev) => !prev)}
                onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
              />
              <small>
                {activeAgent?.name} ({activeAgent?.model}) • Respostas geradas por IA.
              </small>
            </div>
          </section>
        )}

        {activeView === "agents" && (
          <section className="workspace-full">
            <AgentsView
              agents={agents}
              onSelectAgent={handleSelectAgentFromView}
              onOpenCreateModal={() => {
                setEditingAgent(null);
                setIsAgentModalOpen(true);
              }}
              onEditAgent={(agent) => {
                setEditingAgent(agent);
                setIsAgentModalOpen(true);
              }}
              onDeleteAgent={handleDeleteAgent}
            />
          </section>
        )}

        {activeView === "settings" && (
          <section className="workspace-full">
            <SettingsView
              health={health}
              models={models}
              onRefreshHealth={() => {
                fetchHealth()
                  .then(setHealth)
                  .catch(() => setHealth(null));
              }}
            />
          </section>
        )}
      </main>

      {/* Modal de Criação / Edição de Agente */}
      <AgentModal
        isOpen={isAgentModalOpen}
        onClose={() => {
          setIsAgentModalOpen(false);
          setEditingAgent(null);
        }}
        onSave={handleSaveAgent}
        initialAgent={editingAgent}
        availableModels={models}
        availableTools={tools}
      />

      {/* Widget Flutuante de Manaus - Clima, Previsão de Chuva e Horas */}
      <WeatherFloatingWidget />

      {/* Modo Conversa por Voz Interativo (estilo ChatGPT Voice) */}
      <VoiceConversationModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onSendMessage={handleSend}
        activeAgent={activeAgent}
        userName="Hagy"
      />
    </div>
  );
}
