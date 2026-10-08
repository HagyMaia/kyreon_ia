import { useEffect, useState } from "react";
import { X, Sparkles, Bot, Wrench, Edit3 } from "lucide-react";
import type { Agent, AgentCreateInput, ModelInfo, ToolInfo } from "../types";

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (agent: AgentCreateInput, agentId?: string) => Promise<void>;
  initialAgent?: Agent | null;
  availableModels: ModelInfo[];
  availableTools: ToolInfo[];
}

const AVATAR_OPTIONS = ["✦", "🤖", "💻", "🔍", "⚡", "📊", "🎯", "🧠", "📝", "🚀"];

export function AgentModal({
  isOpen,
  onClose,
  onSave,
  initialAgent,
  availableModels,
  availableTools,
}: AgentModalProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("gemini-3.5-flash-lite");
  const [temperature, setTemperature] = useState(0.7);
  const [selectedTools, setSelectedTools] = useState<string[]>(["get_current_datetime", "calculator"]);
  const [avatar, setAvatar] = useState("✦");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEditing = Boolean(initialAgent);

  useEffect(() => {
    if (initialAgent) {
      setName(initialAgent.name || "");
      setRole(initialAgent.role || "");
      setDescription(initialAgent.description || "");
      setSystemPrompt(initialAgent.system_prompt || "");
      setModel(initialAgent.model || "gemini-3.5-flash-lite");
      setTemperature(initialAgent.temperature ?? 0.7);
      setSelectedTools(initialAgent.tools || []);
      setAvatar(initialAgent.avatar || "✦");
    } else {
      setName("");
      setRole("");
      setDescription("");
      setSystemPrompt("");
      setModel("gemini-3.5-flash-lite");
      setTemperature(0.7);
      setSelectedTools(["get_current_datetime", "calculator"]);
      setAvatar("✦");
    }
    setError("");
  }, [isOpen, initialAgent]);

  if (!isOpen) return null;

  function toggleTool(toolId: string) {
    if (selectedTools.includes(toolId)) {
      setSelectedTools(selectedTools.filter((t) => t !== toolId));
    } else {
      setSelectedTools([...selectedTools, toolId]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) {
      setError("Preencha o nome e as instruções do agente.");
      return;
    }

    const selectedModelObj = availableModels.find((m) => m.id === model);
    const provider = selectedModelObj ? selectedModelObj.provider : "auto";

    setLoading(true);
    setError("");
    try {
      await onSave(
        {
          name: name.trim(),
          role: role.trim() || "Assistente Virtual",
          description: description.trim(),
          system_prompt: systemPrompt.trim(),
          provider,
          model,
          temperature,
          tools: selectedTools,
          avatar,
        },
        initialAgent?.id
      );
      onClose();
    } catch (err: any) {
      setError(err.message || (isEditing ? "Erro ao atualizar agente." : "Erro ao criar agente."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-agent-title"
      >
        <div className="modal-header">
          <div className="modal-title" id="modal-agent-title">
            {isEditing ? <Edit3 size={20} /> : <Bot size={20} />}
            <h2>{isEditing ? `Editar Agente: ${initialAgent?.name}` : "Criar Novo Agente"}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            type="button"
            aria-label="Fechar janela"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="alert-error" role="alert">{error}</div>}

          <div className="form-group avatar-picker">
            <label>Ícone do Agente</label>
            <div className="avatar-grid">
              {AVATAR_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  className={`avatar-option ${avatar === icon ? "active" : ""}`}
                  onClick={() => setAvatar(icon)}
                  aria-label={`Selecionar ícone ${icon}`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Nome do Agente *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Auditor Financeiro"
                required
              />
            </div>
            <div className="form-group flex-1">
              <label>Função / Especialidade</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex: Análise de Balanços e ROI"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Descrição Breve</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para que este agente deve ser usado?"
            />
          </div>

          <div className="form-group">
            <label>Instruções do Sistema (System Prompt) *</label>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Defina o papel, tom, diretrizes e objetivos do agente..."
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Modelo de Linguagem (LLM)</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {availableModels.length > 0 ? (
                  availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.provider})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gpt-4o-mini">GPT-4o Mini (OpenAI)</option>
                  </>
                )}
              </select>
            </div>
            <div className="form-group flex-1">
              <label>Criatividade (Temperatura: {temperature})</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="tools-label">
              <Wrench size={14} /> Ferramentas Habilitadas
            </label>
            <div className="tools-checkbox-grid">
              {availableTools.map((tool) => (
                <label key={tool.id} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedTools.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                  />
                  <span>
                    <strong>{tool.name}</strong>
                    <small>{tool.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <Sparkles size={16} />
              {loading
                ? isEditing
                  ? "Salvando..."
                  : "Criando..."
                : isEditing
                ? "Salvar Alterações"
                : "Criar Agente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
