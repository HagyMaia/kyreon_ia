import {
  Bot,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Conversation, SystemHealth } from "../types";

interface SidebarProps {
  onNewChat: () => void;
  activeView: "chat" | "agents" | "settings";
  onChangeView: (view: "chat" | "agents" | "settings") => void;
  conversations: Conversation[];
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string, e: React.MouseEvent) => void;
  health: SystemHealth | null;
}

export function Sidebar({
  onNewChat,
  activeView,
  onChangeView,
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  health,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Sparkles size={18} />
        </div>
        <div>
          <strong>Kyreon AI</strong>
          <span className="brand-sub">Agent Platform</span>
        </div>
      </div>

      <button className="new-chat" onClick={onNewChat}>
        <Plus size={17} />
        Novo chat
      </button>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${activeView === "chat" ? "active" : ""}`}
          onClick={() => onChangeView("chat")}
        >
          <MessageSquare size={17} /> Chat
        </button>
        <button
          className={`nav-item ${activeView === "agents" ? "active" : ""}`}
          onClick={() => onChangeView("agents")}
        >
          <Bot size={17} /> Agentes
        </button>
        <button
          className={`nav-item ${activeView === "settings" ? "active" : ""}`}
          onClick={() => onChangeView("settings")}
        >
          <Settings size={17} /> Configurações
        </button>
      </nav>

      <div className="sidebar-section-title">Histórico Recente</div>
      <div className="conversations-list">
        {conversations.length === 0 ? (
          <div className="empty-history">Nenhuma conversa recente</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conv-item ${conv.id === activeConversationId ? "active" : ""}`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <MessageSquare size={14} className="conv-icon" />
              <span className="conv-title" title={conv.title}>
                {conv.title}
              </span>
              <button
                className="conv-delete"
                title="Excluir conversa"
                onClick={(e) => onDeleteConversation(conv.id, e)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <div className="provider-badge">
          <span className="status-dot-active" />
          <span className="provider-text">
            Provedor: <strong>{health?.active_provider || "detectando..."}</strong>
          </span>
        </div>
      </div>
    </aside>
  );
}
