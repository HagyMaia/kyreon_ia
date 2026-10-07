import { CheckCircle2, XCircle, Cpu, Database, Server, Key } from "lucide-react";
import type { ModelInfo, SystemHealth } from "../types";

interface SettingsViewProps {
  health: SystemHealth | null;
  models: ModelInfo[];
}

export function SettingsView({ health, models }: SettingsViewProps) {
  return (
    <div className="settings-view">
      <div className="settings-header">
        <h2>Configurações da Plataforma</h2>
        <p>Monitore a infraestrutura, status dos provedores de IA e modelos disponíveis.</p>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <div className="card-title">
            <Server size={18} />
            <h3>Status do Sistema</h3>
          </div>
          <div className="status-rows">
            <div className="status-row">
              <span>Backend API:</span>
              <span className="badge-ok">
                <CheckCircle2 size={14} /> {health?.status || "online"}
              </span>
            </div>
            <div className="status-row">
              <span>Banco de Dados:</span>
              <span className="badge-ok">
                <Database size={14} /> {health?.database || "sqlite / aiosqlite"}
              </span>
            </div>
            <div className="status-row">
              <span>Provedor Ativo:</span>
              <span className="badge-active">
                {health?.active_provider?.toUpperCase() || "MOCK"}
              </span>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <div className="card-title">
            <Key size={18} />
            <h3>Provedores de LLM</h3>
          </div>
          <div className="status-rows">
            <div className="status-row">
              <span>OpenAI (Responses API / GPT-4o):</span>
              {health?.openai_configured ? (
                <span className="badge-ok"><CheckCircle2 size={14} /> Configurado</span>
              ) : (
                <span className="badge-warn"><XCircle size={14} /> Chave ausente (.env)</span>
              )}
            </div>
            <div className="status-row">
              <span>Google Gemini (Gemini 2.0 / 1.5):</span>
              {health?.gemini_configured ? (
                <span className="badge-ok"><CheckCircle2 size={14} /> Configurado</span>
              ) : (
                <span className="badge-warn"><XCircle size={14} /> Chave ausente (.env)</span>
              )}
            </div>
            <div className="status-row">
              <span>Mock Local Inteligente:</span>
              <span className="badge-ok"><CheckCircle2 size={14} /> Pronto / Ativo</span>
            </div>
          </div>
          <p className="env-tip">
            💡 Para ativar os provedores reais, configure <code>OPENAI_API_KEY</code> ou{" "}
            <code>GEMINI_API_KEY</code> no arquivo <code>backend/.env</code>.
          </p>
        </div>
      </div>

      <div className="models-section">
        <h3>Modelos Conectados</h3>
        <div className="models-table-wrapper">
          <table className="models-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Provedor</th>
                <th>Janela de Contexto</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    <div className="model-id">{m.id}</div>
                  </td>
                  <td>
                    <span className="provider-pill">{m.provider}</span>
                  </td>
                  <td>{(m.context_window / 1000).toFixed(0)}k tokens</td>
                  <td>{m.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
