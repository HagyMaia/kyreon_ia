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

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

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
      throw new Error("Não foi possível conectar ao servidor. Verifique se o backend está ativo.");
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
  const response = await fetchWithTimeout(
    `${API_URL}/agent/chat`,
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
    60000 // 60s para LLM e tool calling
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const message =
      errData.detail ||
      (response.status === 429
        ? "Limite de requisições excedido. Aguarde alguns segundos."
        : response.status === 503
        ? "Serviço de IA temporariamente indisponível."
        : "Falha ao consultar o agente.");
    throw new Error(message);
  }

  return response.json();
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/agent/chat/stream`, {
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
    if (err.name === "AbortError") {
      throw new Error("Tempo limite de streaming excedido (60s).");
    }
    if (err.message && err.message.includes("Failed to fetch")) {
      throw new Error("Não foi possível conectar ao servidor. Verifique se o backend está ativo.");
    }
    throw err;
  }

  if (!response.ok || !response.body) {
    clearTimeout(timeoutId);
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao iniciar streaming do agente.");
  }

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
            // Ignora parsing de chunks intermediários parciais
          }
        }
      }
    }
  } catch (err: any) {
    callbacks?.onError?.(err);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Agentes CRUD completo
export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetchWithTimeout(`${API_URL}/agents`, {}, 15000);
  if (!res.ok) throw new Error("Erro ao buscar agentes");
  return res.json();
}

export async function createAgent(data: AgentCreateInput): Promise<Agent> {
  const res = await fetchWithTimeout(
    `${API_URL}/agents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    20000
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao criar agente");
  }
  return res.json();
}

export async function updateAgent(
  agentId: string,
  data: AgentUpdateInput
): Promise<Agent> {
  const res = await fetchWithTimeout(
    `${API_URL}/agents/${agentId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    20000
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao atualizar agente");
  }
  return res.json();
}

export async function deleteAgent(agentId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_URL}/agents/${agentId}`,
    { method: "DELETE" },
    15000
  );
  if (!res.ok) throw new Error("Erro ao excluir agente");
}

// Histórico de Conversas
export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetchWithTimeout(`${API_URL}/conversations`, {}, 15000);
  if (!res.ok) throw new Error("Erro ao buscar histórico de conversas");
  return res.json();
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const res = await fetchWithTimeout(`${API_URL}/conversations/${id}`, {}, 15000);
  if (!res.ok) throw new Error("Erro ao carregar detalhes da conversa");
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_URL}/conversations/${id}`,
    { method: "DELETE" },
    15000
  );
  if (!res.ok) throw new Error("Erro ao excluir conversa");
}

// Modelos & Tools & Status
export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetchWithTimeout(`${API_URL}/models`, {}, 15000);
  if (!res.ok) throw new Error("Erro ao carregar modelos");
  return res.json();
}

export async function fetchTools(): Promise<ToolInfo[]> {
  const res = await fetchWithTimeout(`${API_URL}/tools`, {}, 15000);
  if (!res.ok) throw new Error("Erro ao carregar ferramentas");
  return res.json();
}

export async function fetchHealth(): Promise<SystemHealth> {
  const res = await fetchWithTimeout(`${API_URL}/health`, {}, 10000);
  if (!res.ok) throw new Error("Erro ao verificar status do sistema");
  return res.json();
}

export async function uploadFile(file: File): Promise<FileUploadResponse> {
  checkOnline();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetchWithTimeout(
    `${API_URL}/files/upload`,
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
