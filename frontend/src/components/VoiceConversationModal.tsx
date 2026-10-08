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
  PhoneOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { KyreonAvatar } from "./KyreonAvatar";
import {
  cleanTextForSpeech,
  createMicrophoneLevelMeter,
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  playTestChime,
  requestMicrophoneAccess,
  speakText,
  stopSpeaking,
  testKyreonVoice,
  unlockSpeechAudio,
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

/**
 * Estados do ciclo de voz contínuo:
 * OUVINDO (listening) → PROCESSANDO (processing) → PENSANDO (thinking) → FALANDO (speaking) → OUVINDO (listening)
 */
export type VoiceState =
  | "idle"
  | "listening"
  | "processing"
  | "thinking"
  | "speaking"
  | "error";

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

  // Diagnóstico de fone de ouvido e microfone
  const [hasHeadphoneConnected, setHasHeadphoneConnected] = useState(true);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [showWindowsHelp, setShowWindowsHelp] = useState(false);
  const [quickText, setQuickText] = useState("");

  // Refs de controle para ciclo conversacional e prevenção de concorrência / stale closures
  const recognitionRef = useRef<SpeechRecognitionController | null>(null);
  const levelMeterRef = useRef<{ stop: () => void } | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const echoGuardTimerRef = useRef<any>(null);
  const isDispatchingRef = useRef(false);
  const micLockedRef = useRef(false);
  const transcriptBufferRef = useRef("");

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

  // Inicializa a sessão contínua quando o modal abre
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
    isDispatchingRef.current = false;
    micLockedRef.current = false;

    // Desbloqueia áudio no mobile/navegadores e toca chime de boas-vindas
    unlockSpeechAudio();
    playTestChime();

    // Inicia sessão de voz automática
    initVoiceSession();

    return () => {
      cleanup();
    };
  }, [isOpen]);

  // Tecla de atalho para interromper Kyreon (Barra de Espaço ou Escape)
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (voiceStateRef.current === "speaking" && (e.code === "Space" || e.key === "Escape")) {
        e.preventDefault();
        handleInterruptSpeaking();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function cleanup() {
    micLockedRef.current = true;
    isDispatchingRef.current = false;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (echoGuardTimerRef.current) {
      clearTimeout(echoGuardTimerRef.current);
      echoGuardTimerRef.current = null;
    }

    levelMeterRef.current?.stop();
    levelMeterRef.current = null;
    setAudioLevel(0);

    try {
      recognitionRef.current?.abort();
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
      updateVoiceState("error");
      setErrorMessage(
        "Reconhecimento de voz não suportado neste navegador. Recomendamos Google Chrome, Microsoft Edge ou Safari."
      );
      return;
    }

    // Solicita acesso ao microfone com auto-diagnóstico
    const micCheck = await requestMicrophoneAccess();
    setHasHeadphoneConnected(micCheck.hasHeadphoneOutput ?? true);

    if (micCheck.granted) {
      updateMicrophoneActive(true);
      setMicPermissionDenied(false);
      setErrorMessage(null);
      startListeningTurn();
    } else {
      updateMicrophoneActive(false);
      updateVoiceState("idle");

      if (micCheck.errorType === "not_allowed") {
        setMicPermissionDenied(true);
        setErrorMessage(
          micCheck.error ||
            "Permissão de microfone bloqueada pelo navegador. Permita o microfone nas configurações de segurança do navegador."
        );
      } else if (micCheck.errorType === "not_found") {
        setMicPermissionDenied(false);
        setErrorMessage(null); // Modo Ouvinte
      } else {
        setErrorMessage(micCheck.error || "Microfone indisponível no momento.");
      }
    }
  }

  /**
   * 1. ESTADO: OUVINDO (listening)
   * Microfone ativo com medidor de volume dinâmico e detecção de silêncio para auto-envio
   */
  function startListeningTurn() {
    if (!isOpenRef.current || micLockedRef.current) return;

    // Cancela qualquer reprodução de TTS prévia
    stopSpeaking();

    // Limpa timers anteriores
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (echoGuardTimerRef.current) {
      clearTimeout(echoGuardTimerRef.current);
      echoGuardTimerRef.current = null;
    }

    setLiveTranscript("");
    transcriptBufferRef.current = "";
    isDispatchingRef.current = false;
    micLockedRef.current = false;

    // Inicia medidor de volume em tempo real (VU meter dinâmico)
    levelMeterRef.current?.stop();
    levelMeterRef.current = createMicrophoneLevelMeter((lvl) => {
      if (voiceStateRef.current === "listening") {
        setAudioLevel(lvl);
      }
    });

    try {
      recognitionRef.current?.abort();
    } catch {}

    const controller = createSpeechRecognition({
      continuous: true,
      autoRestart: false, // Turn-based: controlado explicitamente pela máquina de estados
      onAudioStart: () => {
        if (!micLockedRef.current && isOpenRef.current) {
          updateVoiceState("listening");
        }
      },
      onSpeechStart: () => {
        // Usuário começou a falar: cancela timer de silêncio
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      },
      onSpeechEnd: () => {
        // VAD Nativo: o navegador detectou o fim da elocução do usuário!
        const captured = transcriptBufferRef.current.trim();
        if (captured && !isDispatchingRef.current && !micLockedRef.current) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            const finalTxt = transcriptBufferRef.current.trim();
            if (finalTxt && !isDispatchingRef.current && !micLockedRef.current) {
              dispatchUserTurn(finalTxt);
            }
          }, 500); // 500ms de confirmação pós-fala
        }
      },
      onTranscript: (transcript, isFinal) => {
        if (micLockedRef.current || isDispatchingRef.current) return;

        transcriptBufferRef.current = transcript;
        setLiveTranscript(transcript);

        // Timer inteligente de silêncio: 950ms se frase finalizada, 1350ms em interim
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        const delay = isFinal ? 950 : 1350;
        silenceTimerRef.current = setTimeout(() => {
          const finalTxt = transcriptBufferRef.current.trim();
          if (finalTxt && !isDispatchingRef.current && !micLockedRef.current) {
            dispatchUserTurn(finalTxt);
          }
        }, delay);
      },
      onError: (err) => {
        console.warn("[VoiceModal] Erro de voz:", err);
        levelMeterRef.current?.stop();
        levelMeterRef.current = null;
        setAudioLevel(0);

        if (err.includes("bloqueada") || err.includes("negada")) {
          setMicPermissionDenied(true);
          updateMicrophoneActive(false);
          updateVoiceState("error");
          setErrorMessage(err);
        } else if (err.includes("não encontrado") || err.includes("ocupado")) {
          updateMicrophoneActive(false);
          updateVoiceState("error");
          setErrorMessage(err);
        }
      },
      onEnd: () => {
        levelMeterRef.current?.stop();
        levelMeterRef.current = null;
        setAudioLevel(0);

        // Se o reconhecimento encerrou e há fala coletada, envia imediatamente
        const pending = transcriptBufferRef.current.trim();
        if (pending && !isDispatchingRef.current && !micLockedRef.current) {
          dispatchUserTurn(pending);
        } else if (
          isOpenRef.current &&
          !micLockedRef.current &&
          voiceStateRef.current === "listening"
        ) {
          // O usuário ficou em silêncio e o navegador deu timeout: reinicia escuta
          setTimeout(() => {
            if (
              isOpenRef.current &&
              !micLockedRef.current &&
              voiceStateRef.current === "listening"
            ) {
              startListeningTurn();
            }
          }, 200);
        }
      },
    });

    if (controller) {
      recognitionRef.current = controller;
      updateVoiceState("listening");
      controller.start();
    }
  }

  /**
   * 2 & 3. ESTADOS: PROCESSANDO (processing) → PENSANDO (thinking)
   * Interrompe o microfone imediatamente para evitar captura de eco,
   * despacha o texto para a IA e aguarda a resposta analítica.
   */
  async function dispatchUserTurn(textToSend: string) {
    if (isDispatchingRef.current || micLockedRef.current) return;
    const cleanText = textToSend.trim();
    if (!cleanText) return;

    isDispatchingRef.current = true;
    micLockedRef.current = true; // TRAVA O MICROFONE para impedir captura de eco

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Para o SpeechRecognition e o medidor de volume imediatamente
    levelMeterRef.current?.stop();
    levelMeterRef.current = null;
    setAudioLevel(0);

    try {
      recognitionRef.current?.abort();
    } catch {}
    recognitionRef.current = null;

    // Transição de Estados
    updateVoiceState("processing");
    setLiveTranscript(cleanText);

    setTimeout(() => {
      if (isOpenRef.current && voiceStateRef.current === "processing") {
        updateVoiceState("thinking");
      }
    }, 180);

    try {
      const response = await onSendMessage(cleanText);
      if (!isOpenRef.current) return;

      const replyText =
        typeof response === "string" && response.trim()
          ? response.trim()
          : "Resposta processada com sucesso pelo Kyreon.";

      setLastKyreonReply(replyText);

      // 4. ESTADO: FALANDO (speaking)
      playKyreonVoiceResponse(replyText);
    } catch (err: any) {
      console.error("[VoiceModal] Falha ao enviar fala para o agente:", err);
      if (!isOpenRef.current) return;
      setErrorMessage(
        err.message || "Erro ao conectar com o agente de IA Kyreon."
      );
      updateVoiceState("error");
      isDispatchingRef.current = false;
      micLockedRef.current = false;
    }
  }

  /**
   * 4. ESTADO: FALANDO (speaking)
   * Reproduz via TTS no fone. Microfone permanece rigorosamente DESLIGADO.
   */
  function playKyreonVoiceResponse(text: string) {
    if (!isOpenRef.current) return;

    updateVoiceState("speaking");
    micLockedRef.current = true; // Garante que o microfone continue fechado durante o áudio

    const textToSpeak = cleanTextForSpeech(text);

    speakText(
      textToSpeak,
      () => {
        if (isOpenRef.current) {
          updateVoiceState("speaking");
        }
      },
      () => {
        // Kyreon terminou de falar: ciclo volta automaticamente para OUVINDO
        handleKyreonSpeechComplete();
      },
      (err) => {
        console.warn("[VoiceModal] TTS warning:", err);
        handleKyreonSpeechComplete();
      }
    );
  }

  /**
   * 5. RETORNO AUTOMÁTICO: OUVINDO (listening)
   * Após a fala do Kyreon terminar, aguarda um guard buffer acústico de 350ms
   * e reabre o microfone automaticamente para o próximo turno do usuário.
   */
  function handleKyreonSpeechComplete() {
    if (!isOpenRef.current) return;

    stopSpeaking();

    // Buffer de 350ms para garantir que o som físico dos alto-falantes/fones tenha sumido
    if (echoGuardTimerRef.current) clearTimeout(echoGuardTimerRef.current);
    echoGuardTimerRef.current = setTimeout(() => {
      if (!isOpenRef.current) return;

      micLockedRef.current = false;
      isDispatchingRef.current = false;
      setLiveTranscript("");
      transcriptBufferRef.current = "";

      if (microphoneActiveRef.current) {
        startListeningTurn();
      } else {
        updateVoiceState("idle");
      }
    }, 350);
  }

  /**
   * Interrompe o Kyreon enquanto ele está falando e reabre o microfone imediatamente
   */
  function handleInterruptSpeaking() {
    stopSpeaking();
    if (echoGuardTimerRef.current) clearTimeout(echoGuardTimerRef.current);

    setTimeout(() => {
      if (isOpenRef.current) {
        micLockedRef.current = false;
        isDispatchingRef.current = false;
        setLiveTranscript("");
        transcriptBufferRef.current = "";
        startListeningTurn();
      }
    }, 200);
  }

  // Envio de texto manual opcional (fallback caso usuário prefira digitar)
  function handleQuickTextSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      !quickText.trim() ||
      voiceState === "thinking" ||
      voiceState === "speaking" ||
      voiceState === "processing"
    )
      return;
    const msg = quickText.trim();
    setQuickText("");
    dispatchUserTurn(msg);
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
        aria-label="Conversa Contínua por Voz"
      >
        {/* Cabeçalho com Pílula de Estado Dinâmica */}
        <div className="voice-modal-header">
          <div className="voice-status-pill">
            {voiceState === "listening" && (
              <>
                <span className="pulse-dot green" />
                <span>Ouvindo sua voz...</span>
              </>
            )}
            {voiceState === "processing" && (
              <>
                <span className="pulse-dot amber" />
                <span>Processando fala...</span>
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
                    <span>Pronto para conversar</span>
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
            title="Encerrar conversa por voz (Esc)"
            aria-label="Fechar modal de voz"
          >
            <X size={20} />
          </button>
        </div>

        {/* Centro: Avatar Interativo e Visualizador de Volume de Voz */}
        <div className="voice-visualizer-center">
          <div
            className={`voice-avatar-orb ${
              voiceState === "speaking"
                ? "speaking-glow"
                : voiceState === "listening"
                ? "listening-glow"
                : voiceState === "processing"
                ? "processing-glow"
                : voiceState === "thinking"
                ? "thinking-glow"
                : ""
            }`}
            style={
              voiceState === "listening" && audioLevel > 0.04
                ? {
                    transform: `scale(${1 + Math.min(0.09, audioLevel * 0.16)})`,
                    boxShadow: `0 0 ${40 + audioLevel * 35}px rgba(16, 185, 129, ${
                      0.5 + audioLevel * 0.4
                    })`,
                  }
                : undefined
            }
          >
            <KyreonAvatar size="xl" glow showStatus />
          </div>

          {/* Ondas Sonoras Reativas à Voz e ao Áudio */}
          <div className="voice-waveform-container" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => {
              const isActive =
                voiceState === "speaking" ||
                (voiceState === "listening" && audioLevel > 0.04);
              const dynamicHeight =
                voiceState === "listening" && audioLevel > 0.04
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
                ? "Captando sua voz... termine de falar para enviar automaticamente."
                : "Pode falar normalmente em português. O envio é automático e o Kyreon responde por voz."
              : voiceState === "processing"
              ? "Fala identificada! Enviando para o Kyreon..."
              : voiceState === "thinking"
              ? "Processando resposta analítica com IA..."
              : voiceState === "speaking"
              ? "Reproduzindo resposta no seu fone. Pressione 'Interromper' para falar a qualquer momento."
              : microphoneActive
              ? "Conversa contínua pronta. Fale qualquer pergunta."
              : "Seu fone está conectado para áudio. Você pode digitar e ouvir a resposta falada pelo Kyreon."}
          </p>
        </div>

        {/* Card Informativo se microfone não estiver disponível */}
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

            {showWindowsHelp && (
              <div className="windows-help-drawer">
                <ol>
                  <li>
                    <strong>Plugues do PC:</strong> Se o fone possui conector único P3 e o computador tem entradas separadas (verde/som e rosa/mic), conecte na entrada de microfone ou utilize adaptador.
                  </li>
                  <li>
                    <strong>Painel de Som:</strong> Pressione <code>Win + R</code>, digite <code>mmsys.cpl</code>. Na aba <strong>Gravação</strong>, selecione seu fone, clique em <strong>Habilitar</strong> e <strong>Definir como Padrão</strong>.
                  </li>
                  <li>
                    <strong>Permissões:</strong> Clique no ícone de opções ao lado da barra de URL e permita o <strong>Microfone</strong>.
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

        {/* Caixa de Diálogo da Conversa */}
        <div className="voice-transcript-box" role="region" aria-live="polite">
          {errorMessage && (
            <div className="voice-error-alert" role="alert">
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

          {/* O que o usuário acabou de falar */}
          {liveTranscript && (
            <div className="transcript-user-bubble">
              <span className="speaker-tag">Você ({userName}):</span>
              <p className="transcript-text">{liveTranscript}</p>
            </div>
          )}

          {/* A resposta que o Kyreon falou / está falando */}
          {lastKyreonReply && voiceState !== "listening" && (
            <div className="transcript-kyreon-bubble">
              <span className="speaker-tag kyreon-tag">Kyreon:</span>
              <p className="transcript-text">
                {lastKyreonReply.length > 290
                  ? lastKyreonReply.slice(0, 290) + "..."
                  : lastKyreonReply}
              </p>
            </div>
          )}

          {!liveTranscript && !lastKyreonReply && !errorMessage && (
            <div className="transcript-placeholder">
              <Sparkles size={16} className="placeholder-icon" />
              <span>
                {microphoneActive
                  ? 'Fale qualquer coisa como: "Qual a previsão de chuva para Manaus?"'
                  : 'Digite sua pergunta abaixo para o Kyreon responder em áudio no fone'}
              </span>
            </div>
          )}
        </div>

        {/* Campo Opcional de Digitação para Modo Ouvinte / Fallback de Ruído */}
        <form onSubmit={handleQuickTextSubmit} className="voice-quick-input-form">
          <input
            type="text"
            placeholder={
              microphoneActive
                ? "Ou digite aqui se preferir..."
                : "Digite uma pergunta para o Kyreon responder em áudio..."
            }
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            disabled={
              voiceState === "thinking" ||
              voiceState === "speaking" ||
              voiceState === "processing"
            }
          />
          <button
            type="submit"
            className="btn-quick-send"
            disabled={
              !quickText.trim() ||
              voiceState === "thinking" ||
              voiceState === "speaking" ||
              voiceState === "processing"
            }
            title="Enviar mensagem"
          >
            <Send size={15} />
          </button>
        </form>

        {/* Controles de Sessão no Rodapé */}
        <div className="voice-modal-footer">
          <button
            type="button"
            className="btn-footer-secondary"
            onClick={handleTestAudio}
            title="Tocar som de teste no fone"
            disabled={isTestingAudio}
          >
            <Volume2 size={16} />
            <span>{isTestingAudio ? "Testando Som..." : "Testar Áudio"}</span>
          </button>

          {/* Botão de Interromper (ativo quando Kyreon está falando) */}
          {voiceState === "speaking" && (
            <button
              type="button"
              className="btn-footer-primary stop-speaking"
              onClick={handleInterruptSpeaking}
              title="Interromper fala do Kyreon e falar agora (Espaço)"
            >
              <VolumeX size={16} />
              <span>Interromper Fala</span>
            </button>
          )}

          {/* Botão de Encerrar Sessão de Voz */}
          <button
            type="button"
            className="btn-footer-secondary btn-close-call"
            onClick={onClose}
            title="Encerrar sessão de conversa por voz"
          >
            <PhoneOff size={15} />
            <span>Encerrar Conversa de Voz</span>
          </button>
        </div>
      </div>
    </div>
  );
}
