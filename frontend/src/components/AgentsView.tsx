import { Plus, Trash2, MessageSquare, Pencil, Cpu, Wrench } from "lucide-react";
import type { Agent } from "../types";

interface AgentsViewProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
  onOpenCreateModal: () => void;
  onEditAgent: (agent: Agent) => void;
  onDeleteAgent: (agentId: string) => void;
}

export function AgentsView({
  agents,
  onSelectAgent,
  onOpenCreateModal,
  onEditAgent,
  onDeleteAgent,
}: AgentsViewProps) {
  return (
    <div className="agents-view">
      <div className="agents-header">
        <div>
          <h2>Seus Agentes de IA</h2>
          <p>Crie, personalize e gerencie agentes com instruções, ferramentas e modelos específicos.</p>
        </div>
        <button
          className="btn-primary"
          onClick={onOpenCreateModal}
          aria-label="Criar novo agente"
        >
          <Plus size={16} /> Novo Agente
        </button>
      </div>

      <div className="agents-grid">
        {agents.map((agent) => (
          <div key={agent.id} className="agent-card">
            <div className="agent-card-header">
              <div className="agent-card-avatar" aria-hidden="true">{agent.avatar || "✦"}</div>
              <div className="agent-card-meta">
                <h3>{agent.name}</h3>
                <span className="agent-badge">{agent.role}</span>
              </div>
            </div>

            <p className="agent-card-desc">
              {agent.description || agent.system_prompt.slice(0, 120) + "..."}
            </p>

            <div className="agent-card-specs">
              <div className="spec-item">
                <Cpu size={14} aria-hidden="true" />
                <span>{agent.model} ({agent.provider})</span>
              </div>
              <div className="spec-item">
                <Wrench size={14} aria-hidden="true" />
                <span>{agent.tools?.length || 0} ferramentas</span>
              </div>
            </div>

            <div className="agent-card-actions">
              <button
                className="btn-chat"
                onClick={() => onSelectAgent(agent)}
                aria-label={`Conversar com o agente ${agent.name}`}
              >
                <MessageSquare size={15} aria-hidden="true" /> Conversar
              </button>

              <button
                className="btn-edit"
                title="Editar agente"
                aria-label={`Editar agente ${agent.name}`}
                onClick={() => onEditAgent(agent)}
              >
                <Pencil size={15} aria-hidden="true" />
              </button>

              {!agent.is_default && (
                <button
                  className="btn-delete"
                  title="Excluir agente"
                  aria-label={`Excluir agente ${agent.name}`}
                  onClick={() => onDeleteAgent(agent.id)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
