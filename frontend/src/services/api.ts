import type {
  Agent,
  AgentCreateInput,
  ChatResponse,
  Conversation,
  ConversationDetail,
  Message,
  ModelInfo,
  SystemHealth,
  ToolInfo,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

export async function sendMessage(
  message: string,
  history: Message[],
  conversationId?: string,
  agentId?: string,
): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      conversation_id: conversationId,
      agent_id: agentId,
    }),
  });

  if (!response.ok) {
    throw new Error("Falha ao consultar o agente.");
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
  const response = await fetch(`${API_URL}/agent/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      conversation_id: conversationId,
      agent_id: agentId,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error("Falha ao iniciar streaming do agente.");
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
            // Ignora parsing de chunks intermediários
          }
        }
      }
    }
  } catch (err: any) {
    callbacks?.onError?.(err);
    throw err;
  }
}

// Agentes
export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_URL}/agents`);
  if (!res.ok) throw new Error("Erro ao buscar agentes");
  return res.json();
}

export async function createAgent(data: AgentCreateInput): Promise<Agent> {
  const res = await fetch(`${API_URL}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Erro ao criar agente");
  return res.json();
}

export async function deleteAgent(agentId: string): Promise<void> {
  const res = await fetch(`${API_URL}/agents/${agentId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Erro ao excluir agente");
}

// Histórico de Conversas
export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_URL}/conversations`);
  if (!res.ok) throw new Error("Erro ao buscar histórico de conversas");
  return res.json();
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const res = await fetch(`${API_URL}/conversations/${id}`);
  if (!res.ok) throw new Error("Erro ao carregar detalhes da conversa");
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Erro ao excluir conversa");
}

// Modelos & Tools & Status
export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_URL}/models`);
  if (!res.ok) throw new Error("Erro ao carregar modelos");
  return res.json();
}

export async function fetchTools(): Promise<ToolInfo[]> {
  const res = await fetch(`${API_URL}/tools`);
  if (!res.ok) throw new Error("Erro ao carregar ferramentas");
  return res.json();
}

export async function fetchHealth(): Promise<SystemHealth> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error("Erro ao verificar status do sistema");
  return res.json();
}
