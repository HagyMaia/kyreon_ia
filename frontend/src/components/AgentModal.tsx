import { useState } from "react";
import { X, Sparkles, Bot, Wrench } from "lucide-react";
import type { AgentCreateInput, ModelInfo, ToolInfo } from "../types";

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (agent: AgentCreateInput) => Promise<void>;
  availableModels: ModelInfo[];
  availableTools: ToolInfo[];
}

const AVATAR_OPTIONS = ["✦", "🤖", "💻", "🔍", "⚡", "📊", "🎯", "🧠", "📝", "🚀"];

export function AgentModal({
  isOpen,
  onClose,
  onSave,
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
      await onSave({
        name: name.trim(),
        role: role.trim() || "Assistente Virtual",
        description: description.trim(),
        system_prompt: systemPrompt.trim(),
        provider,
        model,
        temperature,
        tools: selectedTools,
        avatar,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Erro ao criar agente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog">
        <div className="modal-header">
          <div className="modal-title">
            <Bot size={20} />
            <h2>Criar Novo Agente</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="alert-error">{error}</div>}

          <div className="form-group avatar-picker">
            <label>Ícone do Agente</label>
            <div className="avatar-grid">
              {AVATAR_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  className={`avatar-option ${avatar === icon ? "active" : ""}`}
                  onClick={() => setAvatar(icon)}
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
              placeholder="Defina a personalidade, regras de negócio e como o agente deve responder..."
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Modelo LLM</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.provider})
                  </option>
                ))}
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
              {loading ? "Criando..." : "Salvar Agente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
