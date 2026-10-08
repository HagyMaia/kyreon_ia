export type Role = "user" | "assistant" | "system";

export interface ToolCallInfo {
  tool: string;
  arguments: Record<string, any>;
  result: any;
}

export interface Message {
  id?: string;
  role: Role;
  content: string;
  tool_calls?: ToolCallInfo[];
  created_at?: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  system_prompt: string;
  provider: string;
  model: string;
  temperature: number;
  tools: string[];
  avatar: string;
  is_default: boolean;
  created_at?: string;
}

export interface AgentCreateInput {
  name: string;
  role: string;
  description: string;
  system_prompt: string;
  provider: string;
  model: string;
  temperature: number;
  tools: string[];
  avatar: string;
}

export interface Conversation {
  id: string;
  title: string;
  agent_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface ChatResponse {
  conversation_id: string;
  message_id?: string;
  agent_id?: string;
  content: string;
  tool_calls?: ToolCallInfo[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  context_window: number;
}

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
}

export interface SystemHealth {
  status: string;
  app: string;
  database: string;
  active_provider: string;
  openai_configured: boolean;
  gemini_configured: boolean;
}

export interface FileUploadResponse {
  filename: string;
  extension: string;
  size_bytes: number;
  character_count: number;
  content: string;
  preview: string;
  status: string;
  message: string;
}

export type ChatStatus =
  | "idle"
  | "sending"
  | "processing"
  | "responding"
  | "success"
  | "error"
  | "offline"
  | "reconnecting";

export type TTSState = "idle" | "playing" | "paused" | "stopped";

export type MicState =
  | "disabled"
  | "requesting_permission"
  | "ready"
  | "listening"
  | "processing"
  | "finished"
  | "error";

export type AgentUpdateInput = Partial<AgentCreateInput>;
