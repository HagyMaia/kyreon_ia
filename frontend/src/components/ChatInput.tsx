import {
  ArrowUp,
  AudioLines,
  Brain,
  Check,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Volume2,
  VolumeX,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { uploadFile } from "../services/api";
import {
  createMicrophoneLevelMeter,
  createSpeechRecognition,
  isSecureContextAvailable,
  isSpeechRecognitionSupported,
  listenToPermissionChanges,
  requestMicrophoneAccess,
  stopSpeaking,
  type SpeechRecognitionController,
} from "../services/voice";
import type { FileUploadResponse, MicState } from "../types";

interface ChatInputProps {
  loading: boolean;
  onSend: (message: string) => void;
  placeholder?: string;
  autoSpeak?: boolean;
  onToggleAutoSpeak?: () => void;
  thinkingMode?: boolean;
  onToggleThinkingMode?: () => void;
  onOpenVoiceModal?: () => void;
}

export function ChatInput({
  loading,
  onSend,
  placeholder = "Pergunte qualquer coisa",
  autoSpeak = false,
  onToggleAutoSpeak,
  thinkingMode = false,
  onToggleThinkingMode,
  onOpenVoiceModal,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attachedDoc, setAttachedDoc] = useState<FileUploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Estados do microfone: desativado → solicitando permissão → pronto → ouvindo → processando → finalizado
  const [micState, setMicState] = useState<MicState>(() => {
    if (!isSpeechRecognitionSupported()) return "disabled";
    if (!isSecureContextAvailable()) return "disabled";
    return "ready";
  });

  const [showVoiceTooltip, setShowVoiceTooltip] = useState(() => {
    return localStorage.getItem("kyreon_voice_tip_dismissed") !== "true";
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionController | null>(null);
  const levelMeterRef = useRef<{ stop: () => void } | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const latestTranscriptRef = useRef<string>("");

  const sttSupported = isSpeechRecognitionSupported() && isSecureContextAvailable();

  useEffect(() => {
    // Monitora revogação ou alteração dinâmica de permissão de microfone
    const unsub = listenToPermissionChanges((permState) => {
      if (permState === "denied") {
        setMicState("error");
        setUploadError("Permissão de microfone foi revogada nas configurações do navegador.");
      } else if (permState === "granted" && micState === "error") {
        setMicState("ready");
        setUploadError(null);
      }
    });

    return () => {
      unsub?.();
      recognitionRef.current?.abort();
      levelMeterRef.current?.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  function dismissTooltip() {
    setShowVoiceTooltip(false);
    localStorage.setItem("kyreon_voice_tip_dismissed", "true");
  }

  function finishAndSendSpokenMessage(textOverride?: string) {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    levelMeterRef.current?.stop();
    levelMeterRef.current = null;
    setAudioLevel(0);

    setMicState("processing");

    try {
      recognitionRef.current?.stop();
    } catch {}

    const rawMessage = (
      textOverride !== undefined ? textOverride : latestTranscriptRef.current || value
    ).trim();
    latestTranscriptRef.current = "";

    setMicState("finished");
    setTimeout(() => {
      setMicState("ready");
    }, 1200);

    if (!rawMessage && !attachedDoc) return;

    let finalMessage = rawMessage;
    if (attachedDoc) {
      const promptText =
        rawMessage || "Por favor, analise as informações contidas neste documento.";
      finalMessage = `[DOCUMENTO ANEXADO: ${attachedDoc.filename} (${attachedDoc.character_count} caracteres)]\n\`\`\`\n${attachedDoc.content}\n\`\`\`\n\n${promptText}`;
    }

    if (finalMessage) {
      onSend(finalMessage);
      setValue("");
      setAttachedDoc(null);
      setUploadError(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  }

  function cancelListening() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    levelMeterRef.current?.stop();
    levelMeterRef.current = null;
    setAudioLevel(0);

    try {
      recognitionRef.current?.abort();
    } catch {}
    setMicState("ready");
    latestTranscriptRef.current = "";
  }

  async function toggleListening() {
    if (micState === "listening") {
      finishAndSendSpokenMessage();
      return;
    }

    if (!sttSupported) {
      if (!isSecureContextAvailable()) {
        setUploadError("O acesso ao microfone requer conexão segura HTTPS ou execução em localhost.");
      } else {
        setUploadError(
          "Reconhecimento de voz não suportado neste navegador. Recomendamos Google Chrome, Edge ou Safari atualizado."
        );
      }
      setMicState("disabled");
      return;
    }

    dismissTooltip();
    setUploadError(null);
    latestTranscriptRef.current = "";

    // 1. Estado: Solicitando Permissão
    setMicState("requesting_permission");

    // Solicita permissão prévia liberando as faixas imediatamente para não trancar canal exclusivo
    const micCheck = await requestMicrophoneAccess(undefined, false);
    if (!micCheck.granted) {
      setMicState("error");
      if (micCheck.errorType === "not_found" && onOpenVoiceModal) {
        onOpenVoiceModal();
        return;
      }
      setUploadError(
        micCheck.error || "Microfone indisponível. Verifique as permissões do navegador."
      );
      return;
    }

    // 2. Estado: Ativo & Ouvindo
    const controller = createSpeechRecognition({
      onAudioStart: () => {
        setMicState("listening");
      },
      onSpeechStart: () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      },
      onSpeechEnd: () => {
        // Detecção nativa do fim da fala: envia rapidamente em 550ms
        if (latestTranscriptRef.current.trim() || value.trim()) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            const txt = (latestTranscriptRef.current || value).trim();
            if (txt) {
              finishAndSendSpokenMessage(txt);
            }
          }, 550);
        }
      },
      onTranscript: (transcript, isFinal) => {
        latestTranscriptRef.current = transcript;
        setValue(transcript);
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          textareaRef.current.style.height = `${Math.min(
            textareaRef.current.scrollHeight,
            140
          )}px`;
        }

        // Auto-envio responsivo: 950ms após frase finalizada ou 1350ms em fala contínua
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        const delay = isFinal ? 950 : 1350;
        silenceTimerRef.current = setTimeout(() => {
          const txt = (latestTranscriptRef.current || transcript).trim();
          if (txt) {
            finishAndSendSpokenMessage(txt);
          }
        }, delay);
      },
      onError: (err) => {
        console.warn("Erro no reconhecimento de voz:", err);
        levelMeterRef.current?.stop();
        levelMeterRef.current = null;
        setAudioLevel(0);
        setUploadError(err);
        setMicState("error");
        setTimeout(() => setMicState("ready"), 3000);
      },
      onEnd: () => {
        levelMeterRef.current?.stop();
        levelMeterRef.current = null;
        setAudioLevel(0);

        // Se o serviço de voz encerrou e há fala capturada, envia imediatamente
        const pendingText = (latestTranscriptRef.current || value).trim();
        if (pendingText) {
          finishAndSendSpokenMessage(pendingText);
        } else {
          setMicState((prev) => (prev === "listening" ? "ready" : prev));
        }
      },
    });

    if (controller) {
      recognitionRef.current = controller;
      controller.start();
      setMicState("listening");
    }
  }

  function handleVoiceButtonClick() {
    dismissTooltip();

    if (value.trim() || attachedDoc) {
      submit();
      return;
    }

    if (micState === "listening") {
      finishAndSendSpokenMessage();
      stopSpeaking();
      return;
    }

    if (onOpenVoiceModal) {
      onOpenVoiceModal();
      return;
    }

    toggleListening();
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadFile(file);
      setAttachedDoc(res);
    } catch (err: any) {
      setUploadError(err.message || "Erro ao processar arquivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function submit(event?: FormEvent) {
    if (event) event.preventDefault();

    if (micState === "listening") {
      recognitionRef.current?.stop();
      setMicState("ready");
    }

    const textToSend = value.trim();
    if (!textToSend && !attachedDoc) return;

    let finalMessage = textToSend;
    if (attachedDoc) {
      const promptText =
        textToSend || "Por favor, analise as informações contidas neste documento.";
      finalMessage = `[DOCUMENTO ANEXADO: ${attachedDoc.filename} (${attachedDoc.character_count} caracteres)]\n\`\`\`\n${attachedDoc.content}\n\`\`\`\n\n${promptText}`;
    }

    onSend(finalMessage);
    setValue("");
    setAttachedDoc(null);
    setUploadError(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleInput(e: ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    const target = e.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
  }

  const hasContent = Boolean(value.trim() || attachedDoc);

  return (
    <div className="composer-wrapper">
      {/* Banner de Erro de Upload / Permissão */}
      {uploadError && (
        <div className="upload-error-banner" role="alert">
          <div className="alert-content">
            <AlertTriangle size={14} className="alert-icon" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            aria-label="Fechar alerta de erro"
            title="Fechar"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Estados Visuais do Microfone */}
      {micState === "requesting_permission" && (
        <div className="voice-status-banner requesting">
          <Loader2 size={15} className="spin-icon" />
          <span>Solicitando permissão de microfone ao navegador...</span>
        </div>
      )}

      {micState === "processing" && (
        <div className="voice-status-banner processing">
          <Loader2 size={15} className="spin-icon" />
          <span>Processando e formatando fala...</span>
        </div>
      )}

      {micState === "finished" && (
        <div className="voice-status-banner finished">
          <Check size={15} />
          <span>Transcrição finalizada com sucesso!</span>
        </div>
      )}

      {/* Banner de Gravação Ativa */}
      {micState === "listening" && (
        <div className="voice-recording-banner">
          <div className="recording-status-group">
            <span
              className="recording-pulse-dot"
              style={{
                transform: `scale(${1 + Math.min(1.4, audioLevel * 2.5)})`,
                boxShadow: `0 0 ${8 + audioLevel * 24}px rgba(6, 182, 212, ${0.5 + audioLevel * 0.5})`,
              }}
            />
            <div className="recording-text-container">
              <span className="recording-status-title">
                {audioLevel > 0.08
                  ? "Captando sua voz..."
                  : "Ouvindo... envio automático ao parar de falar"}
              </span>
              <span className="recording-preview-text">
                {value.trim() ? `"${value}"` : "Pode falar normalmente..."}
              </span>
            </div>
          </div>

          <div className="banner-voice-actions">
            <button
              type="button"
              className="stop-voice-btn send-btn"
              onClick={() => finishAndSendSpokenMessage()}
              aria-label="Enviar agora a mensagem por voz"
              title="Envio automático ao pausar ou clique para enviar imediatamente"
            >
              <Check size={14} className="send-check-icon" />
              <span>Enviar Agora</span>
            </button>
            <button
              type="button"
              className="cancel-voice-btn"
              onClick={cancelListening}
              aria-label="Cancelar gravação de voz"
              title="Cancelar gravação"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Documento Anexado */}
      {attachedDoc && (
        <div className="attached-document-chip">
          <FileText size={15} className="doc-icon" aria-hidden="true" />
          <div className="doc-meta">
            <span className="doc-name">{attachedDoc.filename}</span>
            <span className="doc-badge">
              {attachedDoc.character_count.toLocaleString()} caracteres extraídos
            </span>
          </div>
          <button
            type="button"
            className="doc-remove-btn"
            title="Remover documento"
            aria-label="Remover documento anexado"
            onClick={() => setAttachedDoc(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Barra de Chat (Pílula com Ações Internas) */}
      <form className="composer-chatgpt" onSubmit={submit}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.csv,.json,.md,.markdown,.py,.js,.ts,.html,.css,.sql,.yaml,.yml"
          style={{ display: "none" }}
          onChange={handleFileChange}
          aria-label="Upload de arquivo"
        />

        {/* Botão + (Anexar) */}
        <button
          type="button"
          className={`btn-plus-attach ${uploading ? "loading" : ""}`}
          title="Anexar documento (PDF, TXT, CSV, Código)"
          aria-label="Anexar documento ou código"
          disabled={uploading || loading || micState === "listening"}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 size={18} className="spin-icon" />
          ) : (
            <Plus size={19} />
          )}
        </button>

        {/* Campo de Entrada de Texto */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            micState === "listening"
              ? "Ouvindo... pode falar..."
              : attachedDoc
              ? "Instrua o que o agente deve analisar no documento..."
              : placeholder
          }
          disabled={loading || uploading}
          className="composer-textarea"
          aria-label="Mensagem para o agente de IA"
        />

        {/* Grupo de Ações à Direita */}
        <div className="composer-right-actions">
          {/* Botão Pensar */}
          {onToggleThinkingMode && (
            <button
              type="button"
              className={`btn-think-mode ${thinkingMode ? "active" : ""}`}
              title={
                thinkingMode
                  ? "Modo Pensar ativado"
                  : "Ativar Modo Pensar (Raciocínio profundo)"
              }
              aria-label={
                thinkingMode
                  ? "Desativar modo de raciocínio profundo"
                  : "Ativar modo de raciocínio profundo"
              }
              onClick={onToggleThinkingMode}
            >
              <Brain size={15} />
              <span>Pensar</span>
            </button>
          )}

          {/* Botão Auto-Speak (Voz de leitura) */}
          {onToggleAutoSpeak && (
            <button
              type="button"
              className={`btn-autospeak-toggle ${autoSpeak ? "active" : ""}`}
              title={
                autoSpeak
                  ? "Leitura por voz ativada"
                  : "Ativar leitura por voz das respostas"
              }
              aria-label={
                autoSpeak
                  ? "Desativar leitura por voz das respostas"
                  : "Ativar leitura por voz das respostas"
              }
              onClick={onToggleAutoSpeak}
            >
              {autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          )}

          {/* Botão Microfone (STT com estados visuais) */}
          <button
            type="button"
            className={`btn-mic-pill ${
              micState === "listening"
                ? "active-listening"
                : micState === "requesting_permission"
                ? "requesting"
                : micState === "disabled"
                ? "disabled"
                : ""
            }`}
            title={
              micState === "listening"
                ? "Parar de ouvir e enviar"
                : micState === "disabled"
                ? "Microfone indisponível ou requer HTTPS"
                : "Falar por voz (Microfone)"
            }
            aria-label={
              micState === "listening"
                ? "Parar gravação de voz e enviar"
                : "Gravar mensagem por voz"
            }
            disabled={loading || uploading || micState === "disabled"}
            onClick={toggleListening}
          >
            {micState === "requesting_permission" ? (
              <Loader2 size={18} className="spin-icon" />
            ) : micState === "listening" ? (
              <MicOff size={18} className="mic-active-icon" />
            ) : (
              <Mic size={18} />
            )}
          </button>

          {/* Botão de Modo Voz / Enviar */}
          <div className="voice-button-wrapper">
            {showVoiceTooltip && !hasContent && (
              <div className="voice-tooltip-balloon" role="tooltip">
                <span className="tooltip-text">
                  Converse em tempo real com o Kyreon usando o recurso Voz
                </span>
                <button
                  type="button"
                  className="tooltip-close-btn"
                  onClick={dismissTooltip}
                  title="Fechar dica"
                  aria-label="Fechar dica de voz"
                >
                  <X size={13} />
                </button>
                <div className="tooltip-arrow" />
              </div>
            )}

            <button
              type={hasContent ? "submit" : "button"}
              className={`btn-voice-circle ${hasContent ? "send-mode" : "voice-mode"} ${
                micState === "listening" ? "active-pulse" : ""
              }`}
              title={
                hasContent
                  ? "Enviar mensagem"
                  : micState === "listening"
                  ? "Parar gravação"
                  : "Modo Conversa por Voz com Kyreon"
              }
              aria-label={
                hasContent
                  ? "Enviar mensagem"
                  : "Abrir modo de conversa por voz com o Kyreon"
              }
              disabled={loading || uploading}
              onClick={handleVoiceButtonClick}
            >
              {hasContent ? (
                <ArrowUp size={18} strokeWidth={2.4} />
              ) : (
                <AudioLines size={18} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
