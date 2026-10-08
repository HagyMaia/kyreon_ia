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
  X,
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
  isSpeechRecognitionSupported,
  requestMicrophoneAccess,
  stopSpeaking,
  type SpeechRecognitionController,
} from "../services/voice";
import type { FileUploadResponse } from "../types";

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
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showVoiceTooltip, setShowVoiceTooltip] = useState(() => {
    return localStorage.getItem("kyreon_voice_tip_dismissed") !== "true";
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionController | null>(null);
  const levelMeterRef = useRef<{ stop: () => void } | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const latestTranscriptRef = useRef<string>("");

  const sttSupported = isSpeechRecognitionSupported();

  useEffect(() => {
    return () => {
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

    try {
      recognitionRef.current?.stop();
    } catch {}
    setIsListening(false);

    const rawMessage = (textOverride !== undefined ? textOverride : latestTranscriptRef.current || value).trim();
    latestTranscriptRef.current = "";

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
    setIsListening(false);
    latestTranscriptRef.current = "";
  }

  async function toggleListening() {
    if (isListening) {
      finishAndSendSpokenMessage();
    } else {
      if (!sttSupported) {
        setUploadError(
          "O seu navegador não possui suporte ao reconhecimento de voz nativo. Recomendamos usar o Google Chrome ou Microsoft Edge."
        );
        return;
      }

      dismissTooltip();
      setUploadError(null);
      latestTranscriptRef.current = "";

      // Solicita permissão prévia do microfone
      const micCheck = await requestMicrophoneAccess();
      if (!micCheck.granted) {
        if (micCheck.errorType === "not_found" && onOpenVoiceModal) {
          // Abre o Modo Voz que conta com o Modo Ouvinte e teste de som no fone
          onOpenVoiceModal();
          return;
        }
        setUploadError(
          micCheck.error ||
            "Microfone não detectado. Seu fone de ouvido está ativo para ouvir o Kyreon."
        );
        return;
      }

      // Inicia medidor de volume para feedback visual em tempo real (VU meter)
      levelMeterRef.current?.stop();
      levelMeterRef.current = createMicrophoneLevelMeter((lvl) => {
        setAudioLevel(lvl);
      });

      const controller = createSpeechRecognition({
        onTranscript: (transcript) => {
          latestTranscriptRef.current = transcript;
          setValue(transcript);
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(
              textareaRef.current.scrollHeight,
              140
            )}px`;
          }

          // Reinicia timer de silêncio para auto-envio suave após 2.6s sem falar
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (latestTranscriptRef.current.trim()) {
              finishAndSendSpokenMessage(latestTranscriptRef.current.trim());
            }
          }, 2600);
        },
        onError: (err) => {
          console.warn("Erro no reconhecimento de voz:", err);
          levelMeterRef.current?.stop();
          levelMeterRef.current = null;
          setAudioLevel(0);
          setUploadError(err);
          setIsListening(false);
        },
        onEnd: () => {
          levelMeterRef.current?.stop();
          levelMeterRef.current = null;
          setAudioLevel(0);
          setIsListening(false);
        },
      });

      if (controller) {
        recognitionRef.current = controller;
        controller.start();
        setIsListening(true);
      }
    }
  }

  // Ativa o modo de conversa por voz (Abre Modal ou grava)
  function handleVoiceButtonClick() {
    dismissTooltip();

    // Se houver texto digitado, funciona como botão Enviar
    if (value.trim() || attachedDoc) {
      submit();
      return;
    }

    // Se estiver ouvindo pelo microfone do input, para a gravação
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      stopSpeaking();
      return;
    }

    // Abre o Modo Conversa por Voz
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

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const rawMessage = value.trim();
    if ((!rawMessage && !attachedDoc) || loading || uploading) return;

    let finalMessage = rawMessage;
    if (attachedDoc) {
      const promptText =
        rawMessage || "Por favor, analise as informações contidas neste documento.";
      finalMessage = `[DOCUMENTO ANEXADO: ${attachedDoc.filename} (${attachedDoc.character_count} caracteres)]\n\`\`\`\n${attachedDoc.content}\n\`\`\`\n\n${promptText}`;
    }

    onSend(finalMessage);
    setValue("");
    setAttachedDoc(null);
    setUploadError(null);

    // Ajusta a altura da textarea após envio
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
    // Auto-ajuste de altura
    const target = e.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
  }

  const hasContent = Boolean(value.trim() || attachedDoc);

  return (
    <div className="composer-wrapper">
      {/* Banner de Erro de Upload */}
      {uploadError && (
        <div className="upload-error-banner">
          <span>{uploadError}</span>
          <button type="button" onClick={() => setUploadError(null)}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Banner de Gravação de Voz Ativa com VU Meter e Envio Direto */}
      {isListening && (
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
                {audioLevel > 0.08 ? "Captando sua voz..." : "Ouvindo seu microfone/fone..."}
              </span>
              <span className="recording-preview-text">
                {value.trim() ? `"${value}"` : "Fale sua mensagem em português..."}
              </span>
            </div>
          </div>

          <div className="banner-voice-actions">
            <button
              type="button"
              className="stop-voice-btn send-btn"
              onClick={() => finishAndSendSpokenMessage()}
              title="Concluir e enviar mensagem para o Kyreon"
            >
              <Check size={14} className="send-check-icon" />
              <span>Concluir e Enviar</span>
            </button>
            <button
              type="button"
              className="cancel-voice-btn"
              onClick={cancelListening}
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
          <FileText size={15} className="doc-icon" />
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
            onClick={() => setAttachedDoc(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Barra de Chat Estilo ChatGPT (Pílula com Ações Internas) */}
      <form className="composer-chatgpt" onSubmit={submit}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.csv,.json,.md,.markdown,.py,.js,.ts,.html,.css,.sql,.yaml,.yml"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* Botão + (Anexar) */}
        <button
          type="button"
          className={`btn-plus-attach ${uploading ? "loading" : ""}`}
          title="Anexar documento (PDF, TXT, CSV, Código)"
          disabled={uploading || loading || isListening}
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
            isListening
              ? "Ouvindo... pode falar..."
              : attachedDoc
              ? "Instrua o que o agente deve analisar no documento..."
              : placeholder
          }
          disabled={loading || uploading}
          className="composer-textarea"
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
                  ? "Modo Pensar ativado (Raciocínio profundo ativado)"
                  : "Ativar Modo Pensar (Análise profunda passo a passo)"
              }
              onClick={onToggleThinkingMode}
            >
              <Brain size={15} />
              <span>Pensar</span>
            </button>
          )}

          {/* Botão Microfone (STT) */}
          {sttSupported && (
            <button
              type="button"
              className={`btn-mic-pill ${isListening ? "active-listening" : ""}`}
              title={isListening ? "Parar de ouvir" : "Falar por voz"}
              disabled={loading || uploading}
              onClick={toggleListening}
            >
              {isListening ? (
                <MicOff size={18} className="mic-active-icon" />
              ) : (
                <Mic size={18} />
              )}
            </button>
          )}

          {/* Botão de Voz / Enviar e Balão de Dica */}
          <div className="voice-button-wrapper">
            {/* Balão Azul Idêntico à Referência */}
            {showVoiceTooltip && !hasContent && (
              <div className="voice-tooltip-balloon" role="tooltip">
                <span className="tooltip-text">
                  Converse em voz alta com o Kyreon usando o recurso Voz
                </span>
                <button
                  type="button"
                  className="tooltip-close-btn"
                  onClick={dismissTooltip}
                  title="Fechar dica"
                >
                  <X size={13} />
                </button>
                <div className="tooltip-arrow" />
              </div>
            )}

            <button
              type={hasContent ? "submit" : "button"}
              className={`btn-voice-circle ${hasContent ? "send-mode" : "voice-mode"} ${
                isListening || autoSpeak ? "active-pulse" : ""
              }`}
              title={
                hasContent
                  ? "Enviar mensagem"
                  : isListening
                  ? "Parar modo de voz"
                  : "Conversar por voz com o Kyreon"
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
