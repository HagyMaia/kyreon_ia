import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Send,
  Loader2,
  RefreshCw,
  AlertCircle,
  Headphones,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { KyreonAvatar } from "./KyreonAvatar";
import {
  createMicrophoneLevelMeter,
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  playTestChime,
  requestMicrophoneAccess,
  speakText,
  stopSpeaking,
  testKyreonVoice,
  type SpeechRecognitionController,
} from "../services/voice";
import type { Agent } from "../types";

interface VoiceConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => Promise<string | void>;
  activeAgent?: Agent;
  userName?: string;
}

type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

export function VoiceConversationModal({
  isOpen,
  onClose,
  onSendMessage,
  activeAgent,
  userName = "Hagy",
}: VoiceConversationModalProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [lastKyreonReply, setLastKyreonReply] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Detecção inteligente de fone e microfone
  const [hasHeadphoneConnected, setHasHeadphoneConnected] = useState(true);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [showWindowsHelp, setShowWindowsHelp] = useState(false);
  const [quickText, setQuickText] = useState("");

  const recognitionRef = useRef<SpeechRecognitionController | null>(null);
  const levelMeterRef = useRef<{ stop: () => void } | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const isListeningActiveRef = useRef(false);
  const transcriptBufferRef = useRef("");

  // Refs de sincronização para evitar bugs de stale closure em callbacks assíncronos
  const voiceStateRef = useRef<VoiceState>("idle");
  const microphoneActiveRef = useRef(false);
  const isOpenRef = useRef(isOpen);

  function updateVoiceState(state: VoiceState) {
    voiceStateRef.current = state;
    setVoiceState(state);
  }

  function updateMicrophoneActive(active: boolean) {
    microphoneActiveRef.current = active;
    setMicrophoneActive(active);
  }

  // Inicializa quando o modal abre
  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      cleanup();
      return;
    }

    setErrorMessage(null);
    setLiveTranscript("");
    setLastKyreonReply("");
    setQuickText("");
    transcriptBufferRef.current = "";

    // Toca som de ativação suave do Kyreon para confirmar a saída de áudio nos fones
    playTestChime();

    // Inicia sessão de voz
    initVoiceSession();

    return () => {
      cleanup();
    };
  }, [isOpen]);

  function cleanup() {
    isListeningActiveRef.current = false;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    levelMeterRef.current?.stop();
    levelMeterRef.current = null;
    setAudioLevel(0);

    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;
    stopSpeaking();
    updateVoiceState("idle");
  }

  async function initVoiceSession() {
    setErrorMessage(null);
    setMicPermissionDenied(false);

    if (!isSpeechRecognitionSupported()) {
      updateMicrophoneActive(false);
      updateVoiceState("idle");
      return;
    }

    // Solicita acesso ao microfone com auto-diagnóstico
    const micCheck = await requestMicrophoneAccess();
    setHasHeadphoneConnected(micCheck.hasHeadphoneOutput ?? true);

    if (micCheck.granted) {
      updateMicrophoneActive(true);
      setMicPermissionDenied(false);
      setErrorMessage(null);
      startListening();
    } else {
      updateMicrophoneActive(false);
      updateVoiceState("idle");

      if (micCheck.errorType === "not_allowed") {
        setMicPermissionDenied(true);
        setErrorMessage(
          micCheck.error ||
            "Permissão de microfone bloqueada pelo navegador. Clique no cadeado ao lado de localhost e permita o microfone."
        );
      } else if (micCheck.errorType === "not_found") {
        // O fone de ouvido está conectado para áudio, mas o Windows não detectou a entrada de microfone
        setMicPermissionDenied(false);
        setErrorMessage(null); // Modo Ouvinte Ativo
      } else {
        setErrorMessage(micCheck.error || "Microfone indisponível no momento.");
      }
    }
  }

  function startListening() {
    if (!isOpenRef.current) return;

    // Cancela qualquer fala anterior
    stopSpeaking();
    setLiveTranscript("");
    transcriptBufferRef.current = "";

    // Inicia medidor de volume para ondas sonoras interativas
    levelMeterRef.current?.stop();
    levelMeterRef.current = createMicrophoneLevelMeter((lvl) => {
      setAudioLevel(lvl);
    });

    const controller = createSpeechRecognition({
      onTranscript: (transcript) => {
        transcriptBufferRef.current = transcript;
        setLiveTranscript(transcript);

        // Reinicia timer de silêncio para auto-envio após 2.4s de pausa
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (transcriptBufferRef.current.trim()) {
            handleSendSpokenMessage(transcriptBufferRef.current.trim());
          }
        }, 2400);
      },
      onError: (err) => {
        console.warn("[VoiceModal] Erro de voz:", err);
        levelMeterRef.current?.stop();
        levelMeterRef.current = null;
        setAudioLevel(0);

        if (err.includes("bloqueada") || err.includes("negada")) {
          setMicPermissionDenied(true);
          updateMicrophoneActive(false);
        }
        if (err.includes("não encontrado") || err.includes("ocupado")) {
          updateMicrophoneActive(false);
        }
        setErrorMessage(err);
        updateVoiceState("idle");
      },
      onEnd: () => {
        // Se ainda estiver em modo de escuta contínua, reinicia
        if (isListeningActiveRef.current && voiceStateRef.current === "listening") {
          try {
            recognitionRef.current?.start();
          } catch {}
        }
      },
    });

    if (controller) {
      recognitionRef.current = controller;
      isListeningActiveRef.current = true;
      updateVoiceState("listening");
      controller.start();
    }
  }

  async function handleSendSpokenMessage(textToSend: string) {
    if (!textToSend.trim() || voiceStateRef.current === "thinking") return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    isListeningActiveRef.current = false;
    levelMeterRef.current?.stop();
    levelMeterRef.current = null;
    setAudioLevel(0);

    try {
      recognitionRef.current?.stop();
    } catch {}

    updateVoiceState("thinking");
    setLiveTranscript(textToSend);

    try {
      const response = await onSendMessage(textToSend);
      const replyText =
        typeof response === "string"
          ? response
          : "Resposta processada com sucesso pelo Kyreon.";

      setLastKyreonReply(replyText);
      updateVoiceState("speaking");

      // Fala a resposta do Kyreon no fone de ouvido do usuário
      speakText(
        replyText,
        () => {
          updateVoiceState("speaking");
        },
        () => {
          // Quando terminar de falar, se tiver microfone ativo, volta a ouvir automaticamente
          if (isOpenRef.current) {
            if (microphoneActiveRef.current) {
              updateVoiceState("listening");
              startListening();
            } else {
              updateVoiceState("idle");
            }
          }
        },
        (err) => {
          console.warn("[VoiceModal] Erro ao falar resposta:", err);
          if (isOpenRef.current) {
            updateVoiceState("idle");
          }
        }
      );
    } catch (err: any) {
      setErrorMessage(
        err.message || "Erro ao processar mensagem com o agente Kyreon."
      );
      updateVoiceState("error");
    }
  }

  function handleManualSend() {
    const text = (liveTranscript || transcriptBufferRef.current).trim();
    if (text) {
      handleSendSpokenMessage(text);
    }
  }

  function handleQuickTextSubmit(e: FormEvent) {
    e.preventDefault();
    if (!quickText.trim() || voiceState === "thinking" || voiceState === "speaking") return;
    const msg = quickText.trim();
    setQuickText("");
    handleSendSpokenMessage(msg);
  }

  function handleTestAudio() {
    setIsTestingAudio(true);
    testKyreonVoice(
      () => setIsTestingAudio(true),
      () => setIsTestingAudio(false)
    );
  }

  if (!isOpen) return null;

  return (
    <div className="voice-modal-backdrop" onClick={onClose}>
      <div
        className="voice-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Cabeçalho */}
        <div className="voice-modal-header">
          <div className="voice-status-pill">
            {voiceState === "listening" && (
              <>
                <span className="pulse-dot green" />
                <span>Ouvindo sua voz...</span>
              </>
            )}
            {voiceState === "thinking" && (
              <>
                <Loader2 size={13} className="spin-icon text-cyan" />
                <span>Kyreon pensando...</span>
              </>
            )}
            {voiceState === "speaking" && (
              <>
                <span className="pulse-dot blue" />
                <span>Kyreon falando no fone...</span>
              </>
            )}
            {voiceState === "error" && (
              <>
                <AlertCircle size={13} className="text-red" />
                <span>Aviso de Áudio</span>
              </>
            )}
            {voiceState === "idle" && (
              <>
                {microphoneActive ? (
                  <>
                    <Mic size={13} className="text-cyan" />
                    <span>Pronto para ouvir</span>
                  </>
                ) : (
                  <>
                    <Headphones size={13} className="text-cyan" />
                    <span>Fone Conectado • Modo Ouvinte</span>
                  </>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            className="btn-close-voice-modal"
            onClick={onClose}
            title="Encerrar conversa por voz"
          >
            <X size={20} />
          </button>
        </div>

        {/* Centro: Avatar e Visualizador Sonoro */}
        <div className="voice-visualizer-center">
          <div
            className={`voice-avatar-orb ${
              voiceState === "speaking"
                ? "speaking-glow"
                : voiceState === "listening"
                ? "listening-glow"
                : voiceState === "thinking"
                ? "thinking-glow"
                : ""
            }`}
            style={
              voiceState === "listening" && audioLevel > 0.05
                ? {
                    transform: `scale(${1 + Math.min(0.08, audioLevel * 0.15)})`,
                    boxShadow: `0 0 ${40 + audioLevel * 30}px rgba(6, 182, 212, ${0.5 + audioLevel * 0.4})`,
                  }
                : undefined
            }
          >
            <KyreonAvatar size="xl" glow showStatus />
          </div>

          {/* Ondas Sonoras Dinâmicas com Reação ao Volume da Voz */}
          <div className="voice-waveform-container">
            {[0, 1, 2, 3, 4].map((i) => {
              const isActive =
                voiceState === "speaking" ||
                (voiceState === "listening" && audioLevel > 0.05);
              const dynamicHeight =
                voiceState === "listening" && audioLevel > 0.05
                  ? Math.min(38, 10 + audioLevel * (28 + (i % 3) * 5))
                  : undefined;

              return (
                <span
                  key={i}
                  className={`wave-bar b${i + 1} ${isActive ? "active" : ""}`}
                  style={dynamicHeight ? { height: `${dynamicHeight}px` } : undefined}
                />
              );
            })}
          </div>

          <h2 className="voice-agent-title">
            {activeAgent?.name || "Kyreon Assistente de IA"}
          </h2>
          <p className="voice-subtext">
            {voiceState === "listening"
              ? audioLevel > 0.08
                ? "Captando sua fala... continue ou aguarde para enviar."
                : "Pode falar normalmente em português. O Kyreon responderá em voz alta no seu fone."
              : voiceState === "thinking"
              ? "Processando resposta analítica..."
              : voiceState === "speaking"
              ? "Reproduzindo resposta por áudio no seu fone..."
              : microphoneActive
              ? "Clique em 'Falar Agora' ou diga sua pergunta."
              : "Seu fone está conectado para áudio. Você pode digitar e ouvir a resposta falada pelo Kyreon."}
          </p>
        </div>

        {/* Card Informativo: Fone Conectado & Diagnóstico de Microfone */}
        {!microphoneActive && (
          <div className="headphone-status-card">
            <div className="headphone-card-top">
              <div className="headphone-pill-badge">
                <Headphones size={15} />
                <span>Fone de Ouvido: <strong>Conectado e Ativo</strong></span>
              </div>
              <button
                type="button"
                className="btn-test-chime-small"
                onClick={handleTestAudio}
                disabled={isTestingAudio}
                title="Tocar som de teste no fone"
              >
                <Volume2 size={13} />
                <span>{isTestingAudio ? "Tocando..." : "Testar Som"}</span>
              </button>
            </div>

            <div className="headphone-mic-info">
              <MicOff size={14} className="text-amber" />
              <span>
                O áudio de saída funciona no seu fone. A captura do microfone não foi ativada pelo Windows.
              </span>
              <button
                type="button"
                className="btn-link-toggle"
                onClick={() => setShowWindowsHelp((prev) => !prev)}
              >
                {showWindowsHelp ? (
                  <>Ocultar Dicas <ChevronUp size={12} /></>
                ) : (
                  <>Como ativar no Windows <ChevronDown size={12} /></>
                )}
              </button>
            </div>

            {/* Dicas passo a passo para o Windows */}
            {showWindowsHelp && (
              <div className="windows-help-drawer">
                <ol>
                  <li>
                    <strong>Verifique os plugues do PC:</strong> Se o fone possui um único conector P3 e o computador tem entradas separadas (verde para som, rosa para microfone), conecte na entrada rosa ou use um adaptador Y.
                  </li>
                  <li>
                    <strong>Painel de Som do Windows:</strong> Pressione <code>Win + R</code>, digite <code>mmsys.cpl</code> e dê Enter. Na aba <strong>Gravação</strong>, clique com o botão direito no seu <strong>Headset</strong> e selecione <strong>Habilitar</strong> e <strong>Definir como Padrão</strong>.
                  </li>
                  <li>
                    <strong>Permissão do Navegador:</strong> Clique no cadeado ao lado de <code>localhost:5173</code> na barra de endereços e veja se o Microfone está em <strong>Permitir</strong>.
                  </li>
                </ol>
                <div className="drawer-actions">
                  <button
                    type="button"
                    className="btn-retry-mic-drawer"
                    onClick={initVoiceSession}
                  >
                    <RefreshCw size={12} />
                    <span>Verificar Microfone Novamente</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Caixa de Transcrição e Mensagens */}
        <div className="voice-transcript-box">
          {errorMessage && (
            <div className="voice-error-alert">
              <AlertCircle size={15} />
              <span>{errorMessage}</span>
              {micPermissionDenied && (
                <button
                  type="button"
                  className="btn-retry-mic"
                  onClick={initVoiceSession}
                >
                  <RefreshCw size={12} />
                  <span>Tentar Novamente</span>
                </button>
              )}
            </div>
          )}

          {liveTranscript && (
            <div className="transcript-user-bubble">
              <span className="speaker-tag">Você ({userName}):</span>
              <p className="transcript-text">{liveTranscript}</p>
            </div>
          )}

          {lastKyreonReply && voiceState !== "listening" && (
            <div className="transcript-kyreon-bubble">
              <span className="speaker-tag kyreon-tag">Kyreon:</span>
              <p className="transcript-text">
                {lastKyreonReply.length > 280
                  ? lastKyreonReply.slice(0, 280) + "..."
                  : lastKyreonReply}
              </p>
            </div>
          )}

          {!liveTranscript && !lastKyreonReply && !errorMessage && (
            <div className="transcript-placeholder">
              <Sparkles size={16} className="placeholder-icon" />
              <span>
                {microphoneActive
                  ? 'Diga: "Qual a previsão do tempo para Manaus hoje?"'
                  : 'Digite sua mensagem abaixo ou clique em "Testar Áudio no Fone"'}
              </span>
            </div>
          )}
        </div>

        {/* Campo de Envio Rápido para Modo Ouvinte / Fone de Ouvido */}
        <form onSubmit={handleQuickTextSubmit} className="voice-quick-input-form">
          <input
            type="text"
            placeholder={
              microphoneActive
                ? "Ou digite sua pergunta aqui..."
                : "Digite uma pergunta para o Kyreon responder em voz alta no fone..."
            }
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            disabled={voiceState === "thinking" || voiceState === "speaking"}
          />
          <button
            type="submit"
            className="btn-quick-send"
            disabled={
              !quickText.trim() ||
              voiceState === "thinking" ||
              voiceState === "speaking"
            }
            title="Enviar para resposta em voz"
          >
            <Send size={15} />
          </button>
        </form>

        {/* Controles no Rodapé */}
        <div className="voice-modal-footer">
          <button
            type="button"
            className="btn-footer-secondary"
            onClick={handleTestAudio}
            title="Tocar som de teste no fone de ouvido"
            disabled={isTestingAudio}
          >
            <Volume2 size={16} />
            <span>{isTestingAudio ? "Testando no Fone..." : "Testar Áudio no Fone"}</span>
          </button>

          {microphoneActive && (
            <>
              {voiceState === "listening" ? (
                <button
                  type="button"
                  className="btn-footer-primary active-listening"
                  onClick={handleManualSend}
                  disabled={!((liveTranscript || transcriptBufferRef.current).trim())}
                  title="Enviar o que foi falado para o Kyreon"
                >
                  <Send size={16} />
                  <span>Enviar Fala</span>
                </button>
              ) : voiceState === "speaking" ? (
                <button
                  type="button"
                  className="btn-footer-primary stop-speaking"
                  onClick={() => {
                    stopSpeaking();
                    updateVoiceState("listening");
                    startListening();
                  }}
                  title="Interromper fala e voltar a ouvir"
                >
                  <VolumeX size={16} />
                  <span>Interromper</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-footer-primary"
                  onClick={startListening}
                  title="Iniciar escuta de voz"
                >
                  <Mic size={16} />
                  <span>Falar Agora</span>
                </button>
              )}
            </>
          )}

          {!microphoneActive && (
            <button
              type="button"
              className="btn-footer-secondary"
              onClick={initVoiceSession}
              title="Tentar reconectar o microfone"
            >
              <RefreshCw size={15} />
              <span>Verificar Microfone</span>
            </button>
          )}

          <button
            type="button"
            className="btn-footer-secondary btn-close-call"
            onClick={onClose}
          >
            <span>Encerrar Voz</span>
          </button>
        </div>
      </div>
    </div>
  );
}
