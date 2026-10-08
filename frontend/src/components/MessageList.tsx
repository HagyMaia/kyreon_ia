import { useEffect, useRef, useState } from "react";
import {
  Wrench,
  Terminal,
  CheckCircle2,
  Bot,
  ArrowRight,
  CloudRain,
  Sparkles,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
} from "lucide-react";
import { KyreonAvatar } from "./KyreonAvatar";
import {
  speakText,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
  unlockSpeechAudio,
} from "../services/voice";
import type { Agent, Message, ToolCallInfo, TTSState } from "../types";

interface MessageListProps {
  messages: Message[];
  activeAgent?: Agent;
  userName?: string;
  autoSpeak?: boolean;
}

function renderToolCall(tc: ToolCallInfo, idx: number) {
  if (tc.tool === "delegate_to_specialist") {
    const res = tc.result || {};
    return (
      <div key={idx} className="specialist-handoff-card">
        <div className="handoff-header">
          <div className="handoff-badge">
            <Bot size={14} className="handoff-icon" />
            <span className="orchestrator-label">Kyreon Orquestrador</span>
            <ArrowRight size={13} className="handoff-arrow" />
            <span className="specialist-tag">
              {res.specialist_avatar || "🤖"} {res.specialist_name || tc.arguments.specialist_id}
            </span>
          </div>
          <span className="handoff-status">Equipe Multi-Agente</span>
        </div>
        <div className="handoff-body">
          <div className="handoff-role-desc">
            {res.specialist_role && <span>{res.specialist_role}</span>}
          </div>
          <div className="handoff-task">
            <span className="task-label">Missão delegada:</span>
            <span className="task-text">"{tc.arguments.task}"</span>
          </div>
        </div>
      </div>
    );
  }

  if (tc.tool === "get_manaus_weather") {
    const res = tc.result || {};
    return (
      <div key={idx} className="weather-tool-card">
        <div className="weather-header">
          <CloudRain size={15} />
          <span>Telemetria Climática: Manaus - Amazonas</span>
          <CheckCircle2 size={13} className="tool-success-icon" />
        </div>
        <div className="weather-badges">
          {res.temperatura_c !== undefined && (
            <span className="w-badge temp">🌡️ {res.temperatura_c}°C</span>
          )}
          {res.probabilidade_chuva_pct !== undefined && (
            <span className="w-badge rain">🌧️ {res.probabilidade_chuva_pct}% chuva</span>
          )}
          {res.condicao_climatica && (
            <span className="w-badge cond">{res.condicao_climatica}</span>
          )}
          {res.umidade_relativa_pct !== undefined && (
            <span className="w-badge humidity">💧 {res.umidade_relativa_pct}% umidade</span>
          )}
        </div>
      </div>
    );
  }

  if (tc.tool === "save_user_memory") {
    const res = tc.result || {};
    return (
      <div key={idx} className="memory-tool-card">
        <div className="memory-header">
          <Sparkles size={14} />
          <span>Memória de Longo Prazo Registrada</span>
          <CheckCircle2 size={13} className="tool-success-icon" />
        </div>
        <div className="memory-content">
          "{res.conteudo || tc.arguments.content}"
        </div>
      </div>
    );
  }

  // Ferramenta padrão
  return (
    <div key={idx} className="tool-call-badge">
      <div className="tool-call-title">
        <Wrench size={13} />
        <span>
          Ferramenta executada: <strong>{tc.tool}</strong>
        </span>
        <CheckCircle2 size={13} className="tool-success-icon" />
      </div>
      {tc.result && (
        <div className="tool-call-result">
          <Terminal size={11} />
          <code>
            {typeof tc.result === "object"
              ? JSON.stringify(tc.result)
              : String(tc.result)}
          </code>
        </div>
      )}
    </div>
  );
}

export function MessageList({
  messages,
  activeAgent,
  userName = "Hagy",
  autoSpeak = false,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [speakingState, setSpeakingState] = useState<TTSState>("idle");
  const lastSpokenMsgRef = useRef<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Se auto-speak estiver ativado, lê a última mensagem recebida do assistente
  useEffect(() => {
    if (!autoSpeak || !messages.length) return;
    const lastMsg = messages[messages.length - 1];
    if (
      lastMsg.role === "assistant" &&
      lastMsg.content &&
      lastMsg.content !== lastSpokenMsgRef.current &&
      !lastMsg.content.startsWith("⚡")
    ) {
      lastSpokenMsgRef.current = lastMsg.content;
      unlockSpeechAudio();
      speakText(
        lastMsg.content,
        () => {
          setSpeakingIndex(messages.length - 1);
          setSpeakingState("playing");
        },
        () => {
          setSpeakingIndex(null);
          setSpeakingState("idle");
        },
        () => {
          setSpeakingIndex(null);
          setSpeakingState("idle");
        },
        (state) => setSpeakingState(state)
      );
    }
  }, [messages, autoSpeak]);

  function handleStartSpeak(content: string, index: number) {
    unlockSpeechAudio();
    speakText(
      content,
      () => {
        setSpeakingIndex(index);
        setSpeakingState("playing");
      },
      () => {
        setSpeakingIndex(null);
        setSpeakingState("idle");
      },
      () => {
        setSpeakingIndex(null);
        setSpeakingState("idle");
      },
      (state) => setSpeakingState(state)
    );
  }

  function handlePauseSpeak() {
    pauseSpeaking();
    setSpeakingState("paused");
  }

  function handleResumeSpeak() {
    resumeSpeaking();
    setSpeakingState("playing");
  }

  function handleStopSpeak() {
    stopSpeaking();
    setSpeakingIndex(null);
    setSpeakingState("idle");
  }

  const isKyreon =
    !activeAgent ||
    activeAgent.name.toLowerCase().includes("kyreon") ||
    Boolean(activeAgent.is_default);

  if (!messages.length) {
    return (
      <div className="empty-state">
        <div className="empty-avatar-wrap">
          {isKyreon ? (
            <KyreonAvatar size="xl" glow showStatus />
          ) : (
            <div className="empty-icon">{activeAgent?.avatar || "✦"}</div>
          )}
        </div>
        <h1 className="empty-title">
          {isKyreon ? "Kyreon Assistente de IA" : activeAgent?.name || "Kyreon Assistente de IA"}
        </h1>
        <p className="empty-greeting">
          Olá {userName}, como posso lhe ajudar hoje?
        </p>
      </div>
    );
  }

  return (
    <div className="messages">
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const hasContent = Boolean(message.content && message.content.trim());
        const isCurrentSpeaking = speakingIndex === index;

        return (
          <div key={message.id || index} className={`message-row ${message.role}`}>
            <div className="avatar-wrapper">
              {isUser ? (
                <div className="avatar user-avatar" aria-label="Você">U</div>
              ) : isKyreon ? (
                <KyreonAvatar size="sm" />
              ) : (
                <div className="avatar" aria-label={activeAgent?.name || "Agente"}>{activeAgent?.avatar || "✦"}</div>
              )}
            </div>
            <div className="message-container">
              {message.tool_calls && message.tool_calls.length > 0 && (
                <div className="tool-calls-container">
                  {message.tool_calls.map((tc, tcIdx) => renderToolCall(tc, tcIdx))}
                </div>
              )}

              <div className="message-content">
                {hasContent ? (
                  message.content.split("\n").map((line, i) => (
                    <p key={i}>{line || "\u00A0"}</p>
                  ))
                ) : (
                  <p className="empty-message-content">
                    <em>(Nenhum conteúdo retornado)</em>
                  </p>
                )}
              </div>

              {!isUser && !message.content.startsWith("⚡") && hasContent && (
                <div className="message-footer-actions">
                  {isCurrentSpeaking ? (
                    <div className="tts-controls-group" role="group" aria-label="Controles de reprodução de voz">
                      {speakingState === "paused" ? (
                        <button
                          type="button"
                          className="btn-speak-message active"
                          aria-label="Continuar áudio da resposta"
                          title="Continuar áudio"
                          onClick={handleResumeSpeak}
                        >
                          <Play size={12} aria-hidden="true" />
                          <span>Continuar</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-speak-message active"
                          aria-label="Pausar áudio da resposta"
                          title="Pausar áudio"
                          onClick={handlePauseSpeak}
                        >
                          <Pause size={12} aria-hidden="true" />
                          <span>Pausar</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-speak-message danger"
                        aria-label="Parar reprodução de voz"
                        title="Parar áudio"
                        onClick={handleStopSpeak}
                      >
                        <Square size={11} aria-hidden="true" />
                        <span>Parar</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-speak-message"
                      aria-label="Ouvir resposta com voz sintetizada"
                      title="Ouvir resposta"
                      onClick={() => handleStartSpeak(message.content, index)}
                    >
                      <Volume2 size={13} aria-hidden="true" />
                      <span>Ouvir</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
