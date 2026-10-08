import { useEffect, useState } from "react";
import { ChevronDown, Plus, Sparkles, Bot } from "lucide-react";
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
  deleteAgent,
  deleteConversation,
  fetchAgents,
  fetchConversation,
  fetchConversations,
  fetchHealth,
  fetchModels,
  fetchTools,
  sendMessage,
  streamMessage,
} from "./services/api";
import type {
  Agent,
  AgentCreateInput,
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

  // Estado do Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [thinkingMode, setThinkingMode] = useState(false);

  // Modais
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

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

  async function handleCreateAgent(data: AgentCreateInput) {
    const created = await createAgent(data);
    setAgents((prev) => [...prev, created]);
    setActiveAgent(created);
    handleNewChat();
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
    const promptToSend =
      thinkingMode && !content.startsWith("[MODO PENSAR]")
        ? `[MODO PENSAR ATIVADO: Analise detalhadamente com raciocínio profundo passo a passo antes de responder]\n\n${content}`
        : content;

    const userMessage: Message = { role: "user", content };
    const history = [...messages];

    setMessages((current) => [...current, userMessage]);
    setLoading(true);

    const hasTools = activeAgent?.tools && activeAgent.tools.length > 0;

    // Se o agente possui ferramentas (ex: Kyreon Orquestrador), usa chamada com orquestração de tools e handoff
    if (hasTools) {
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
        return result.content;
      } catch (err: any) {
        const errorMsg = `⚠️ Falha ao processar solicitação: ${err.message || "Erro de conexão"}`;
        setMessages((current) => {
          const updated = [...current];
          updated[assistantIndex] = {
            role: "assistant",
            content: errorMsg,
          };
          return updated;
        });
        return errorMsg;
      } finally {
        setLoading(false);
      }
    }

    // Para agentes sem ferramentas, streaming contínuo em tempo real
    const assistantIndex = messages.length + 1;
    let accumulatedContent = "";

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
          },
          onToken: (token) => {
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
          },
        }
      );
      return accumulatedContent;
    } catch (streamErr) {
      console.warn("Falha no streaming, tentando fallback síncrono:", streamErr);
      try {
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
        return result.content;
      } catch {
        const fallbackErr =
          "⚠️ Não foi possível se conectar ao agente. Verifique se o backend está em execução.";
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: fallbackErr,
          },
        ]);
        return fallbackErr;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <Sidebar
        onNewChat={handleNewChat}
        activeView={activeView}
        onChangeView={setActiveView}
        conversations={conversations}
        activeConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        health={health}
      />

      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <span className="status-dot-active" />
            <span className="status-label">Agente online</span>
          </div>

          <div className="topbar-right">
            {/* Alternador de Modo Claro / Escuro */}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />

            {/* Seletor de Agente Ativo */}
            <div className="agent-selector-wrapper">
              <select
                className="agent-select"
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
              onClick={() => setIsAgentModalOpen(true)}
              title="Criar novo agente"
            >
              <Plus size={15} />
              <span>Novo Agente</span>
            </button>
          </div>
        </header>

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
              <div className="typing">
                <span /> <span /> <span /> pensando...
              </div>
            )}

            <div className="composer-area">
              <ChatInput
                loading={loading}
                onSend={handleSend}
                placeholder={
                  activeAgent
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
              onOpenCreateModal={() => setIsAgentModalOpen(true)}
              onDeleteAgent={handleDeleteAgent}
            />
          </section>
        )}

        {activeView === "settings" && (
          <section className="workspace-full">
            <SettingsView health={health} models={models} />
          </section>
        )}
      </main>

      {/* Modal de Criação de Agente */}
      <AgentModal
        isOpen={isAgentModalOpen}
        onClose={() => setIsAgentModalOpen(false)}
        onSave={handleCreateAgent}
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
