import type {
  Agent,
  AgentCreateInput,
  AgentUpdateInput,
  ChatResponse,
  Conversation,
  ConversationDetail,
  FileUploadResponse,
  Message,
  ModelInfo,
  SystemHealth,
  ToolInfo,
} from "../types";
import {
  DEFAULT_FALLBACK_AGENTS,
  DEFAULT_FALLBACK_MODELS,
  DEFAULT_FALLBACK_TOOLS,
  generateSimulatedResponse,
} from "../constants/defaults";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const custom = localStorage.getItem("kyreon_api_url");
    if (custom) return custom.trim().replace(/\/+$/, "");
  }
  return (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");
}

export function setApiBaseUrl(url: string): void {
  if (typeof window !== "undefined") {
    if (url && url.trim()) {
      localStorage.setItem("kyreon_api_url", url.trim().replace(/\/+$/, ""));
    } else {
      localStorage.removeItem("kyreon_api_url");
    }
  }
}

function checkOnline(): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Você está desconectado da internet. Verifique sua conexão de rede.");
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30000
): Promise<Response> {
  checkOnline();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Tempo limite da requisição (${Math.round(timeoutMs / 1000)}s) excedido.`);
    }
    if (err.message && err.message.includes("Failed to fetch")) {
      throw new Error(`Não foi possível conectar ao servidor em ${url}. Verifique se o backend está ativo.`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

export async function sendMessage(
  message: string,
  history: Message[],
  conversationId?: string,
  agentId?: string,
): Promise<ChatResponse> {
  const apiUrl = getApiBaseUrl();
  try {
    const response = await fetchWithTimeout(
      `${apiUrl}/agent/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history,
          conversation_id: conversationId,
          agent_id: agentId,
        }),
      },
      60000
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg =
        errData.detail ||
        (response.status === 429
          ? "Limite de requisições excedido. Aguarde alguns segundos."
          : response.status === 503
          ? "Serviço de IA temporariamente indisponível."
          : "Falha ao consultar o agente.");
      throw new Error(errMsg);
    }

    return response.json();
  } catch (err: any) {
    console.warn("[Kyreon API] Backend indisponível para sendMessage, ativando fallback local:", err.message);
    // Simulação local quando backend está offline
    const agents = getLocalAgents();
    const active = agents.find((a) => a.id === agentId) || agents[0];
    const simulated = generateSimulatedResponse(message, active);
    const content = `> ℹ️ *[Modo Demonstração no Navegador — Backend FastAPI offline em ${apiUrl}]*\n\n${simulated}`;
    return {
      content,
      conversation_id: conversationId || `demo-conv-${Date.now()}`,
      agent_id: agentId || "default-assistant",
      tool_calls: [],
    };
  }
}

export async function streamMessage(
  message: string,
  history: Message[],
  conversationId?: string,
  agentId?: string,
  callbacks?: {
    onStart?: (data: { conversation_id: string; agent_id: string }) => void;
    onToken?: (token: string) => void;
    onDone?: (data: { conversation_id: string; content: string }) => void;
    onError?: (err: Error) => void;
  },
): Promise<void> {
  checkOnline();
  const apiUrl = getApiBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  let response: Response | null = null;
  try {
    response = await fetch(`${apiUrl}/agent/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history,
        conversation_id: conversationId,
        agent_id: agentId,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn("[Kyreon Stream] Falha de conexão com backend:", err.message);
  }

  // Se o backend respondeu com sucesso e corpo de streaming
  if (response && response.ok && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.type === "start" && callbacks?.onStart) {
                callbacks.onStart(data);
              } else if (data.type === "token" && callbacks?.onToken) {
                callbacks.onToken(data.token);
              } else if (data.type === "done" && callbacks?.onDone) {
                callbacks.onDone(data);
              }
            } catch {
              // ignora chunk parcial
            }
          }
        }
      }
      return;
    } catch (err: any) {
      callbacks?.onError?.(err);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // FALLBACK STREAMING INTELIGENTE: Quando o backend está inacessível
  clearTimeout(timeoutId);
  const convId = conversationId || `demo-conv-${Date.now()}`;
  const agents = getLocalAgents();
  const active = agents.find((a) => a.id === agentId) || agents[0];
  const simulated = generateSimulatedResponse(message, active);
  const fullText = `> ℹ️ *[Modo Demonstração no Navegador — Backend FastAPI offline em ${apiUrl}]*\n\n${simulated}`;

  callbacks?.onStart?.({ conversation_id: convId, agent_id: active.id });

  // Emula digitação fluida com intervalos
  const chunks = fullText.match(/.{1,4}/g) || [fullText];
  for (const chunk of chunks) {
    await new Promise((r) => setTimeout(r, 18));
    callbacks?.onToken?.(chunk);
  }

  callbacks?.onDone?.({ conversation_id: convId, content: fullText });
}

// Helpers de persistência local para quando o backend estiver offline
function getLocalAgents(): Agent[] {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("kyreon_agents");
      if (stored) return JSON.parse(stored);
    } catch {}
  }
  return DEFAULT_FALLBACK_AGENTS;
}

function saveLocalAgents(agents: Agent[]): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("kyreon_agents", JSON.stringify(agents));
    } catch {}
  }
}

// Agentes CRUD completo
export async function fetchAgents(): Promise<Agent[]> {
  const apiUrl = getApiBaseUrl();
  try {
    const res = await fetchWithTimeout(`${apiUrl}/agents`, {}, 8000);
    if (!res.ok) throw new Error("Erro ao buscar agentes");
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      saveLocalAgents(data);
      return data;
    }
  } catch (err) {
    console.info("[Kyreon] Backend offline para lista de agentes, carregando locais/padrão.");
  }
  return getLocalAgents();
}

export async function createAgent(data: AgentCreateInput): Promise<Agent> {
  const apiUrl = getApiBaseUrl();
  try {
    const res = await fetchWithTimeout(
      `${apiUrl}/agents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
      15000
    );
    if (res.ok) return res.json();
  } catch (err) {
    console.info("[Kyreon] Backend offline para criação, persistindo agente localmente.");
  }

  // Fallback local
  const newAgent: Agent = {
    ...data,
    id: `local-agent-${Date.now()}`,
    is_default: false,
    created_at: new Date().toISOString(),
  };
  const list = getLocalAgents();
  list.push(newAgent);
  saveLocalAgents(list);
  return newAgent;
}

export async function updateAgent(
  agentId: string,
  data: AgentUpdateInput
): Promise<Agent> {
  const apiUrl = getApiBaseUrl();
  try {
    const res = await fetchWithTimeout(
      `${apiUrl}/agents/${agentId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
      15000
    );
    if (res.ok) return res.json();
  } catch (err) {
    console.info("[Kyreon] Backend offline para atualização, atualizando localmente.");
  }

  // Fallback local
  const list = getLocalAgents();
  const idx = list.findIndex((a) => a.id === agentId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...data };
    saveLocalAgents(list);
    return list[idx];
  }
  throw new Error("Agente não encontrado");
}

export async function deleteAgent(agentId: string): Promise<void> {
  const apiUrl = getApiBaseUrl();
  try {
    const res = await fetchWithTimeout(
      `${apiUrl}/agents/${agentId}`,
      { method: "DELETE" },
      10000
    );
    if (res.ok) return;
  } catch (err) {
    console.info("[Kyreon] Backend offline para exclusão, removendo localmente.");
  }

  // Fallback local
  const list = getLocalAgents().filter((a) => a.id !== agentId);
  saveLocalAgents(list);
}

// Histórico de Conversas
export async function fetchConversations(): Promise<Conversation[]> {
  const apiUrl = getApiBaseUrl();
  try {
    const res = await fetchWithTimeout(`${apiUrl}/conversations`, {}, 8000);
    if (res.ok) return res.json();
  } catch {}
  return [];
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const apiUrl = getApiBaseUrl();
  const res = await fetchWithTimeout(`${apiUrl}/conversations/${id}`, {}, 15000);
  if (!res.ok) throw new Error("Erro ao carregar detalhes da conversa");
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const apiUrl = getApiBaseUrl();
  try {
    await fetchWithTimeout(
      `${apiUrl}/conversations/${id}`,
      { method: "DELETE" },
      10000
    );
  } catch {}
}

// Modelos & Tools & Status
export async function fetchModels(): Promise<ModelInfo[]> {
  const apiUrl = getApiBaseUrl();
  try {
    const res = await fetchWithTimeout(`${apiUrl}/models`, {}, 8000);
    if (res.ok) return res.json();
  } catch {}
  return DEFAULT_FALLBACK_MODELS;
}

export async function fetchTools(): Promise<ToolInfo[]> {
  const apiUrl = getApiBaseUrl();
  try {
    const res = await fetchWithTimeout(`${apiUrl}/tools`, {}, 8000);
    if (res.ok) return res.json();
  } catch {}
  return DEFAULT_FALLBACK_TOOLS;
}

export async function fetchHealth(): Promise<SystemHealth> {
  const apiUrl = getApiBaseUrl();
  const res = await fetchWithTimeout(`${apiUrl}/health`, {}, 6000);
  if (!res.ok) throw new Error("Erro ao verificar status do sistema");
  return res.json();
}

export async function uploadFile(file: File): Promise<FileUploadResponse> {
  checkOnline();
  const apiUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetchWithTimeout(
    `${apiUrl}/files/upload`,
    {
      method: "POST",
      body: formData,
    },
    30000
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Falha ao enviar e processar o arquivo.");
  }

  return res.json();
}
