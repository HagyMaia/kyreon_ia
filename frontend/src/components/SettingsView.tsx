import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Server,
  Key,
  Globe,
  RefreshCw,
  Terminal,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import type { ModelInfo, SystemHealth } from "../types";
import { getApiBaseUrl, setApiBaseUrl, fetchHealth } from "../services/api";

interface SettingsViewProps {
  health: SystemHealth | null;
  models: ModelInfo[];
  onRefreshHealth?: () => void;
}

export function SettingsView({ health, models, onRefreshHealth }: SettingsViewProps) {
  const [apiUrl, setApiUrlState] = useState(getApiBaseUrl());
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveApiUrl = () => {
    setApiBaseUrl(apiUrl);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
    handleTestConnection();
  };

  const handleResetApiUrl = () => {
    const defaultUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");
    setApiUrlState(defaultUrl);
    setApiBaseUrl(defaultUrl);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
    handleTestConnection();
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setPingStatus(null);
    const start = Date.now();
    try {
      const res = await fetchHealth();
      const elapsed = Date.now() - start;
      setPingStatus(`🟢 Conectado com sucesso! (${elapsed}ms) — Provedor: ${res.active_provider?.toUpperCase()}`);
      if (onRefreshHealth) onRefreshHealth();
    } catch (err: any) {
      setPingStatus(`🔴 Backend inacessível: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="settings-view">
      <div className="settings-header">
        <h2>Configurações da Plataforma</h2>
        <p>Monitore a infraestrutura, conectividade do backend e provedores de IA.</p>
      </div>

      <div className="settings-grid">
        {/* Card de Conexão com API */}
        <div className="settings-card full-width-card">
          <div className="card-title">
            <Globe size={18} />
            <h3>Endpoint da API do Backend</h3>
          </div>
          <p className="settings-card-desc">
            Defina a URL base onde a API FastAPI do Kyreon está em execução. O frontend se conecta a esse endereço para conversar, persistir agentes e executar ferramentas.
          </p>

          <div className="api-url-input-group">
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrlState(e.target.value)}
              placeholder="http://localhost:8000/api"
              className="api-url-input"
              aria-label="URL da API Backend"
            />
            <button
              className="settings-btn primary"
              onClick={handleSaveApiUrl}
              aria-label="Salvar URL da API"
            >
              Salvar
            </button>
            <button
              className="settings-btn secondary"
              onClick={handleTestConnection}
              disabled={isTesting}
              aria-label="Testar conexão com backend"
            >
              <RefreshCw size={14} className={isTesting ? "spin" : ""} />
              {isTesting ? "Testando..." : "Testar Conexão"}
            </button>
            <button
              className="settings-btn text-only"
              onClick={handleResetApiUrl}
              aria-label="Restaurar URL padrão"
            >
              Restaurar Padrão
            </button>
          </div>

          {savedNotice && (
            <div className="alert-badge-success">
              ✓ URL salva no navegador com sucesso!
            </div>
          )}

          {pingStatus && (
            <div
              className={`alert-badge ${
                pingStatus.startsWith("🟢") ? "alert-badge-success" : "alert-badge-error"
              }`}
            >
              {pingStatus}
            </div>
          )}
        </div>

        {/* Card de Status do Sistema */}
        <div className="settings-card">
          <div className="card-title">
            <Server size={18} />
            <h3>Status do Sistema</h3>
          </div>
          <div className="status-rows">
            <div className="status-row">
              <span>Backend API:</span>
              {health?.status === "ok" ? (
                <span className="badge-ok">
                  <CheckCircle2 size={14} /> Conectado (FastAPI)
                </span>
              ) : (
                <span className="badge-warn">
                  <XCircle size={14} /> Offline (Modo Demonstração)
                </span>
              )}
            </div>
            <div className="status-row">
              <span>Banco de Dados:</span>
              <span className={health?.database === "healthy" ? "badge-ok" : "badge-warn"}>
                <CheckCircle2 size={14} />{" "}
                {health?.database
                  ? `${health.database} (${health.database_type === "postgresql" ? "PostgreSQL / Neon" : "SQLite"})`
                  : "Local (Offline)"}
              </span>
            </div>
            <div className="status-row">
              <span>Provedor Ativo:</span>
              <span className="badge-active">
                {health?.active_provider?.toUpperCase() || "DEMO LOCAL"}
              </span>
            </div>
          </div>
        </div>

        {/* Card de Provedores de LLM */}
        <div className="settings-card">
          <div className="card-title">
            <Key size={18} />
            <h3>Provedores de LLM</h3>
          </div>
          <div className="status-rows">
            <div className="status-row">
              <span>Google Gemini (Gemini 2.0 Flash):</span>
              {health?.gemini_configured ? (
                <span className="badge-ok"><CheckCircle2 size={14} /> Ativo & Configurado</span>
              ) : (
                <span className="badge-warn"><XCircle size={14} /> Chave ausente (.env)</span>
              )}
            </div>
            <div className="status-row">
              <span>OpenAI (GPT-4o / GPT-4o-mini):</span>
              {health?.openai_configured ? (
                <span className="badge-ok"><CheckCircle2 size={14} /> Configurado</span>
              ) : (
                <span className="badge-warn"><XCircle size={14} /> Chave ausente (.env)</span>
              )}
            </div>
            <div className="status-row">
              <span>Modo Demonstração Offline:</span>
              <span className="badge-ok"><CheckCircle2 size={14} /> Sempre Disponível</span>
            </div>
          </div>
          <p className="env-tip">
            💡 As chaves de API ficam protegidas no arquivo <code>backend/.env</code> e nunca são expostas ao navegador.
          </p>
        </div>

        {/* Guia de Inicialização e Deploy */}
        <div className="settings-card full-width-card guide-card">
          <div className="card-title">
            <Terminal size={18} />
            <h3>Como Executar e Conectar o Backend</h3>
          </div>

          <div className="guide-content">
            <div className="guide-block">
              <strong>1. Desenvolvimento Local (Windows):</strong>
              <p>
                Dê um duplo clique no arquivo <code>iniciar_local.bat</code> na pasta raiz do projeto. Ele iniciará automaticamente o servidor FastAPI na porta 8000 e o Vite na porta 5173.
              </p>
              <pre className="code-box">
                {`# Ou execute manualmente no terminal PowerShell:\ncd backend\n.\\.venv\\Scripts\\Activate.ps1\nuvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`}
              </pre>
            </div>

            <div className="guide-block">
              <strong>2. Deploy em Produção (Vercel + Nuvem):</strong>
              <p>
                A Vercel hospeda o frontend estático. Para que a IA funcione em produção (na URL da Vercel ou no celular), hospede o backend em um serviço gratuito como <strong>Render.com</strong>, <strong>Railway.app</strong> ou <strong>Fly.io</strong>.
              </p>
              <p>
                Em seguida, copie a URL do backend gerada e cole no campo "Endpoint da API do Backend" acima, ou configure a variável de ambiente <code>VITE_API_URL</code> no painel da Vercel.
              </p>
            </div>
          </div>
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
