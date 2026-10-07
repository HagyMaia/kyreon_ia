import { useEffect, useRef } from "react";
import { Wrench, Terminal, CheckCircle2 } from "lucide-react";
import type { Agent, Message } from "../types";

interface MessageListProps {
  messages: Message[];
  activeAgent?: Agent;
  onPromptSuggestion?: (text: string) => void;
}

export function MessageList({
  messages,
  activeAgent,
  onPromptSuggestion,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!messages.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">{activeAgent?.avatar || "✦"}</div>
        <h1>{activeAgent ? activeAgent.name : "Como posso ajudar você hoje?"}</h1>
        <p>
          {activeAgent?.description ||
            "Converse com seus agentes especializados, execute ferramentas e gerencie fluxos de IA."}
        </p>

        <div className="prompt-suggestions">
          <button
            className="suggestion-chip"
            onClick={() =>
              onPromptSuggestion?.(
                "Quais ferramentas e capacidades você tem disponíveis nesta plataforma?"
              )
            }
          >
            🛠️ Quais ferramentas você tem disponíveis?
          </button>
          <button
            className="suggestion-chip"
            onClick={() =>
              onPromptSuggestion?.(
                "Calcule para mim: sqrt(144) * 25 + 500"
              )
            }
          >
            🧮 Calcule: sqrt(144) * 25 + 500
          </button>
          <button
            className="suggestion-chip"
            onClick={() =>
              onPromptSuggestion?.(
                "Qual é a data e o horário atual no sistema?"
              )
            }
          >
            🕒 Qual é a data e hora atual?
          </button>
          <button
            className="suggestion-chip"
            onClick={() =>
              onPromptSuggestion?.(
                "Explique como funciona a arquitetura desta plataforma de agentes."
              )
            }
          >
            🏛️ Como funciona a arquitetura desta plataforma?
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="messages">
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        return (
          <div key={message.id || index} className={`message-row ${message.role}`}>
            <div className="avatar">
              {isUser ? "U" : activeAgent?.avatar || "✦"}
            </div>
            <div className="message-container">
              {message.tool_calls && message.tool_calls.length > 0 && (
                <div className="tool-calls-container">
                  {message.tool_calls.map((tc, tcIdx) => (
                    <div key={tcIdx} className="tool-call-badge">
                      <div className="tool-call-title">
                        <Wrench size={13} />
                        <span>Ferramenta executada: <strong>{tc.tool}</strong></span>
                        <CheckCircle2 size={13} className="tool-success-icon" />
                      </div>
                      {tc.result && (
                        <div className="tool-call-result">
                          <Terminal size={11} />
                          <code>{JSON.stringify(tc.result)}</code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="message-content">
                {message.content.split("\n").map((line, i) => (
                  <p key={i}>{line || "\u00A0"}</p>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
