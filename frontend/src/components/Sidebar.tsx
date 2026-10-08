import {
  Bot,
  MessageSquare,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { KyreonAvatar } from "./KyreonAvatar";
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
  isOpen?: boolean;
  onClose?: () => void;
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
  isOpen = false,
  onClose,
}: SidebarProps) {
  const handleItemClick = (action: () => void) => {
    action();
    if (onClose) onClose();
  };

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <div className="brand">
        <div className="brand-title-wrap">
          <KyreonAvatar size="sm" showStatus glow />
          <div>
            <strong>Kyreon AI</strong>
            <span className="brand-sub">Agent Platform</span>
          </div>
        </div>
        {onClose && (
          <button
            className="sidebar-close-btn"
            onClick={onClose}
            title="Fechar menu"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <button className="new-chat" onClick={() => handleItemClick(onNewChat)}>
        <Plus size={17} />
        <span>Novo chat</span>
      </button>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${activeView === "chat" ? "active" : ""}`}
          onClick={() => handleItemClick(() => onChangeView("chat"))}
        >
          <MessageSquare size={17} /> <span>Chat</span>
        </button>
        <button
          className={`nav-item ${activeView === "agents" ? "active" : ""}`}
          onClick={() => handleItemClick(() => onChangeView("agents"))}
        >
          <Bot size={17} /> <span>Agentes</span>
        </button>
        <button
          className={`nav-item ${activeView === "settings" ? "active" : ""}`}
          onClick={() => handleItemClick(() => onChangeView("settings"))}
        >
          <Settings size={17} /> <span>Configurações</span>
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
              onClick={() => handleItemClick(() => onSelectConversation(conv.id))}
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
          <span className={health ? "status-dot-active" : "status-dot-processing"} />
          <span className="provider-text">
            {health
              ? `Backend: ${health.active_provider?.toUpperCase()}`
              : "Modo Demonstração (Offline)"}
          </span>
        </div>
      </div>
    </aside>
  );
}
