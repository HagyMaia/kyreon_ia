// Voice Service: Speech Recognition (STT) & Speech Synthesis (TTS)
// Auditoria e Otimização para Desktop, Android (Chrome/Edge) e iOS (Safari/Chrome)

export type TTSState = "idle" | "playing" | "paused" | "stopped";

export function isSpeechRecognitionSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    )
  );
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSecureContextAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.isSecureContext);
}

// ==========================================================================
// MICROPHONE PERMISSION & WEB SPEECH RECOGNITION (STT)
// ==========================================================================

export interface AudioDeviceDiagnosis {
  hasAudioOutput: boolean;
  hasAudioInput: boolean;
  outputDevices: string[];
  inputDevices: string[];
}

export async function diagnoseAudioDevices(): Promise<AudioDeviceDiagnosis> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return { hasAudioOutput: false, hasAudioInput: false, outputDevices: [], inputDevices: [] };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices
      .filter((d) => d.kind === "audiooutput")
      .map((d) => d.label || "Saída de Áudio / Fone");
    const inputs = devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => d.label || "Microfone");
    return {
      hasAudioOutput: outputs.length > 0 || devices.length > 0,
      hasAudioInput: inputs.length > 0 && devices.some((d) => d.kind === "audioinput" && d.deviceId),
      outputDevices: outputs,
      inputDevices: inputs,
    };
  } catch {
    return { hasAudioOutput: false, hasAudioInput: false, outputDevices: [], inputDevices: [] };
  }
}

export interface MicrophoneAccessResult {
  granted: boolean;
  hasHeadphoneOutput?: boolean;
  error?: string;
  errorType?: "not_allowed" | "not_found" | "unsupported" | "insecure" | "other";
  detectedInputs?: string[];
  detectedOutputs?: string[];
}

let activeMicrophoneStream: MediaStream | null = null;

export async function getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  } catch {
    return [];
  }
}

export function getActiveMicrophoneStream(): MediaStream | null {
  return activeMicrophoneStream;
}

export function releaseActiveMicrophoneStream(): void {
  if (activeMicrophoneStream) {
    try {
      activeMicrophoneStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    } catch {}
    activeMicrophoneStream = null;
  }
}

/**
 * Solicita acesso ao microfone tratando restrições de HTTPS, permissão e liberação de tracks.
 * Se retainStream for falso (padrão para STT), o stream é liberado imediatamente após verificar a permissão,
 * evitando que o canal de áudio fique bloqueado para o SpeechRecognition nativo do navegador.
 */
export async function requestMicrophoneAccess(
  preferredDeviceId?: string,
  retainStream = false
): Promise<MicrophoneAccessResult> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return {
      granted: false,
      errorType: "insecure",
      error: "O microfone requer conexão segura (HTTPS ou localhost). Acesso bloqueado por segurança.",
    };
  }

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      errorType: "unsupported",
      error: "Seu navegador não possui suporte à captura de áudio pelo microfone.",
    };
  }

  // Se já temos stream ativo e funcionando e retainStream foi solicitado
  if (retainStream && activeMicrophoneStream && activeMicrophoneStream.active) {
    return { granted: true };
  }

  // 1. Tenta acesso direto ao dispositivo
  try {
    const constraints: MediaStreamConstraints = preferredDeviceId
      ? { audio: { deviceId: { exact: preferredDeviceId } } }
      : { audio: true };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    if (retainStream) {
      activeMicrophoneStream = stream;
    } else {
      // Libera as faixas imediatamente para não trancar o dispositivo exclusivo no Windows/Android
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      activeMicrophoneStream = null;
    }
    return { granted: true };
  } catch (err: any) {
    console.warn("[Kyreon Voice] Tentativa direta de microfone falhou:", err);

    let devices: MediaDeviceInfo[] = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {}

    const audioInputs = devices.filter((d) => d.kind === "audioinput");
    const audioOutputs = devices.filter((d) => d.kind === "audiooutput");

    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return {
        granted: false,
        hasHeadphoneOutput: audioOutputs.length > 0,
        errorType: "not_allowed",
        error:
          "Permissão de microfone bloqueada pelo navegador. Clique no ícone de configurações ao lado da URL e permita o acesso ao Microfone.",
      };
    }

    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      const hasOutput = audioOutputs.length > 0 || devices.length > 0;
      return {
        granted: false,
        hasHeadphoneOutput: hasOutput,
        errorType: "not_found",
        detectedInputs: audioInputs.map((d) => d.label || "Microfone"),
        detectedOutputs: audioOutputs.map((d) => d.label || "Fone / Alto-falante"),
        error: hasOutput
          ? "Fone de ouvido detectado para reprodução, mas nenhuma entrada de gravação (microfone) foi encontrada."
          : "Nenhum dispositivo de microfone foi encontrado.",
      };
    }

    return {
      granted: false,
      hasHeadphoneOutput: audioOutputs.length > 0,
      errorType: "other",
      error: `Não foi possível acessar o microfone: ${err.message || err.name}`,
    };
  }
}

export function listenToPermissionChanges(
  onChange: (state: PermissionState) => void
): (() => void) | null {
  if (typeof navigator !== "undefined" && navigator.permissions?.query) {
    let pStatus: PermissionStatus | null = null;
    const listener = () => {
      if (pStatus) onChange(pStatus.state);
    };
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((status) => {
        pStatus = status;
        status.addEventListener("change", listener);
      })
      .catch(() => {});
    return () => {
      pStatus?.removeEventListener("change", listener);
    };
  }
  return null;
}

// Medidor de volume em tempo real (VU Meter via Web Audio API)
export function createMicrophoneLevelMeter(
  onLevel: (level: number) => void
): { stop: () => void } | null {
  if (!activeMicrophoneStream || !activeMicrophoneStream.active) {
    return null;
  }

  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const source = ctx.createMediaStreamSource(activeMicrophoneStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let animId: number | null = null;

    const tick = () => {
      analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i];
      }
      const avg = sum / buffer.length;
      const normalized = Math.min(1, avg / 110);
      onLevel(normalized);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return {
      stop: () => {
        if (animId) cancelAnimationFrame(animId);
        try {
          source.disconnect();
          analyser.disconnect();
          ctx.close().catch(() => {});
        } catch {}
        onLevel(0);
      },
    };
  } catch (err) {
    console.warn("[Kyreon Voice] Erro ao criar level meter:", err);
    return null;
  }
}

export interface SpeechRecognitionController {
  start: () => void;
  stop: () => void;
  abort: () => void;
  isActive?: () => boolean;
}

/**
 * Normaliza e deduplica os resultados do Web Speech API.
 * Corrige o bug crônico do Google Speech Services no Android Chrome / dispositivos móveis,
 * onde cada novo resultado 'isFinal' repete e acumula todas as palavras anteriores da sessão,
 * gerando frases duplicadas como: "Me Me Me fale Me fale um Me fale um pouco...".
 */
export function deduplicateSpeechResults(
  results: Array<{ transcript: string; isFinal: boolean }>
): {
  transcript: string;
  isFinal: boolean;
} {
  const finalSegments: string[] = [];
  let interimText = "";
  let hasAnyFinal = false;

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const raw = (res.transcript || "").trim();
    if (!raw) continue;

    if (res.isFinal) {
      hasAnyFinal = true;
      if (finalSegments.length === 0) {
        finalSegments.push(raw);
        continue;
      }

      const curr = raw;
      const currLower = curr.toLowerCase();
      const prev = finalSegments[finalSegments.length - 1];
      const prevLower = prev.toLowerCase();

      // 1. Idêntico ao segmento anterior
      if (currLower === prevLower) {
        continue;
      }

      // 2. O resultado atual é um superset acumulativo de toda a frase acumulada até agora
      // Ex: acumulado="Me fale", curr="Me fale um pouco sobre você" -> substitui tudo por curr
      const fullAccumulatedLower = finalSegments.join(" ").toLowerCase();
      if (currLower.startsWith(fullAccumulatedLower)) {
        finalSegments.length = 0;
        finalSegments.push(curr);
        continue;
      }

      // 3. O resultado atual é um superset do último segmento
      // Ex: prev="Me", curr="Me fale" -> substitui o último
      if (currLower.startsWith(prevLower)) {
        finalSegments[finalSegments.length - 1] = curr;
        continue;
      }

      // 4. O último segmento já contém o resultado atual
      if (prevLower.startsWith(currLower) || fullAccumulatedLower.endsWith(currLower)) {
        continue;
      }

      // 5. Sobreposição de palavras (sliding window / word overlap)
      // Ex: prev="fale um pouco", curr="um pouco sobre você" -> "fale um pouco sobre você"
      const prevWords = prev.split(/\s+/);
      const currWords = curr.split(/\s+/);
      const maxOverlap = Math.min(prevWords.length, currWords.length);
      let overlapped = false;

      for (let len = maxOverlap; len > 0; len--) {
        const slicePrev = prevWords.slice(prevWords.length - len).join(" ").toLowerCase();
        const sliceCurr = currWords.slice(0, len).join(" ").toLowerCase();
        if (slicePrev === sliceCurr) {
          const remainder = currWords.slice(len).join(" ");
          if (remainder) {
            finalSegments[finalSegments.length - 1] = `${prev} ${remainder}`;
          }
          overlapped = true;
          break;
        }
      }

      if (!overlapped) {
        finalSegments.push(curr);
      }
    } else {
      interimText = raw;
    }
  }

  let finalText = finalSegments.join(" ").trim();
  let full = finalText;

  if (interimText) {
    const finalLower = finalText.toLowerCase();
    const interimLower = interimText.toLowerCase();

    if (!finalText) {
      full = interimText;
    } else if (interimLower.startsWith(finalLower)) {
      // Interim é uma extensão contínua do finalText
      full = interimText;
    } else if (finalLower.endsWith(interimLower) || finalLower.includes(interimLower)) {
      // Já está contido no final
      full = finalText;
    } else {
      // Sobreposição de palavras entre final e interim
      const finalWords = finalText.split(/\s+/);
      const interimWords = interimText.split(/\s+/);
      const maxOverlap = Math.min(finalWords.length, interimWords.length);
      let overlapped = false;

      for (let len = maxOverlap; len > 0; len--) {
        const sliceFinal = finalWords.slice(finalWords.length - len).join(" ").toLowerCase();
        const sliceInterim = interimWords.slice(0, len).join(" ").toLowerCase();
        if (sliceFinal === sliceInterim) {
          const remainder = interimWords.slice(len).join(" ");
          full = remainder ? `${finalText} ${remainder}` : finalText;
          overlapped = true;
          break;
        }
      }

      if (!overlapped) {
        full = `${finalText} ${interimText}`.trim();
      }
    }
  }

  return {
    transcript: full,
    isFinal: hasAnyFinal && !interimText,
  };
}

export interface SpeechRecognitionOptions {
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  onEnd: () => void;
  onAudioStart?: () => void;
  onAudioEnd?: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  continuous?: boolean;
  autoRestart?: boolean;
}

export function createSpeechRecognition(
  options: SpeechRecognitionOptions
): SpeechRecognitionController | null {
  if (!isSpeechRecognitionSupported()) {
    options.onError(
      "O reconhecimento de voz nativo não é suportado por este navegador. Recomendamos Google Chrome, Microsoft Edge ou Safari atualizado."
    );
    return null;
  }

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  let recognition: any;
  let isExplicitlyStopped = false;
  let restartTimeout: any = null;
  let accumulatedSessionText = "";
  let lastSessionTranscript = "";

  try {
    recognition = new SpeechRecognitionClass();
  } catch {
    options.onError("Falha ao instanciar o serviço de voz do navegador.");
    return null;
  }

  recognition.lang = "pt-BR";
  recognition.continuous = options.continuous !== undefined ? options.continuous : true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  if (options.onAudioStart) {
    recognition.onaudiostart = () => {
      options.onAudioStart?.();
    };
  }

  if (options.onAudioEnd) {
    recognition.onaudioend = () => {
      options.onAudioEnd?.();
    };
  }

  if (options.onSpeechStart) {
    recognition.onspeechstart = () => {
      options.onSpeechStart?.();
    };
  }

  if (options.onSpeechEnd) {
    recognition.onspeechend = () => {
      options.onSpeechEnd?.();
    };
  }

  recognition.onresult = (event: any) => {
    const rawList: Array<{ transcript: string; isFinal: boolean }> = [];

    // Se temos texto acumulado de uma sessão anterior reiniciada automaticamente
    if (accumulatedSessionText) {
      rawList.push({
        transcript: accumulatedSessionText,
        isFinal: true,
      });
    }

    for (let i = 0; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res && res[0] && typeof res[0].transcript === "string") {
        rawList.push({
          transcript: res[0].transcript,
          isFinal: Boolean(res.isFinal),
        });
      }
    }

    const { transcript, isFinal } = deduplicateSpeechResults(rawList);
    lastSessionTranscript = transcript;

    if (transcript) {
      options.onTranscript(transcript, isFinal);
    }
  };

  recognition.onerror = (event: any) => {
    console.warn("[Kyreon Voice] Recognition error event:", event.error);
    if (isExplicitlyStopped) return;

    switch (event.error) {
      case "not-allowed":
      case "service-not-allowed":
        options.onError(
          "Permissão de microfone bloqueada. Permita o uso do microfone nas opções do navegador."
        );
        break;
      case "network":
        options.onError(
          "Falha de rede com o serviço de transcrição. Verifique sua conexão com a internet."
        );
        break;
      case "no-speech":
        // Silêncio temporário do usuário
        break;
      case "audio-capture":
        options.onError(
          "Microfone ocupado ou indisponível. Verifique se outro aplicativo está usando o microfone."
        );
        break;
      case "aborted":
        // Abortado intencionalmente
        break;
      default:
        console.log("[Kyreon Voice] Evento de áudio:", event.error);
        break;
    }
  };

  recognition.onend = () => {
    if (isExplicitlyStopped) {
      accumulatedSessionText = "";
      lastSessionTranscript = "";
      options.onEnd();
      return;
    }

    // Se autoRestart estiver expressamente ativo
    if (options.autoRestart) {
      if (lastSessionTranscript) {
        accumulatedSessionText = lastSessionTranscript;
      }

      if (restartTimeout) clearTimeout(restartTimeout);
      restartTimeout = setTimeout(() => {
        if (!isExplicitlyStopped) {
          try {
            recognition.start();
          } catch {
            options.onEnd();
          }
        }
      }, 150);
    } else {
      // Para fluxo conversacional com envio automático, finaliza a sessão para o turno
      options.onEnd();
    }
  };

  return {
    start: () => {
      isExplicitlyStopped = false;
      accumulatedSessionText = "";
      lastSessionTranscript = "";
      if (restartTimeout) clearTimeout(restartTimeout);
      try {
        recognition.start();
      } catch (err: any) {
        console.warn("[Kyreon Voice] Recognition start warning:", err);
      }
    },
    stop: () => {
      isExplicitlyStopped = true;
      accumulatedSessionText = "";
      lastSessionTranscript = "";
      if (restartTimeout) clearTimeout(restartTimeout);
      try {
        recognition.stop();
      } catch {}
    },
    abort: () => {
      isExplicitlyStopped = true;
      accumulatedSessionText = "";
      lastSessionTranscript = "";
      if (restartTimeout) clearTimeout(restartTimeout);
      try {
        recognition.abort();
      } catch {}
    },
    isActive: () => !isExplicitlyStopped,
  };
}

// ==========================================================================
// WEB AUDIO API - TEST CHIME (CONFIRMAÇÃO AUDITIVA IMEDIATA)
// ==========================================================================

export function playTestChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.18, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (err) {
    console.warn("[Kyreon Voice] Falha ao tocar chime:", err);
  }
}

// ==========================================================================
// TEXT-TO-SPEECH (TTS) - SPEECH SYNTHESIS COM PLAY, PAUSE, RESUME, STOP
// ==========================================================================

export function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " Bloco de código omitido. ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[MODO PENSAR[^\]]*\]/gi, " ")
    .replace(/\[DOCUMENTO ANEXADO[^\]]*\]/gi, " ")
    .replace(/⚡|⚠️|💡|🔍|🤖|✨|🚀/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[\*\-•]\s+/gm, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoSentenceChunks(text: string): string[] {
  const clean = cleanTextForSpeech(text);
  if (!clean) return [];

  const rawParts = clean.match(/[^.!?;\n]+[.!?;\n]*/g) || [clean];
  const chunks: string[] = [];

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.length > 170) {
      const subParts = trimmed.match(/[^,:]+[,:]*/g) || [trimmed];
      for (const sub of subParts) {
        const sTrim = sub.trim();
        if (sTrim) chunks.push(sTrim);
      }
    } else {
      chunks.push(trimmed);
    }
  }

  return chunks.length > 0 ? chunks : [clean];
}

let cachedVoices: SpeechSynthesisVoice[] = [];

export function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length > 0) {
    cachedVoices = voices;
  }
  return cachedVoices;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    loadVoices();
  };
}

export function getBestPortugueseVoice(): SpeechSynthesisVoice | null {
  const voices = loadVoices();
  if (!voices.length) return null;

  // 1. Google português do Brasil (Chrome)
  const googlePt = voices.find(
    (v) =>
      (v.lang === "pt-BR" || v.lang === "pt_BR") &&
      v.name.toLowerCase().includes("google")
  );
  if (googlePt) return googlePt;

  // 2. Microsoft Maria / Daniel / Francisca / Antonio / Natural (Edge / Windows)
  const naturalPt = voices.find(
    (v) =>
      (v.lang === "pt-BR" || v.lang === "pt_BR") &&
      (v.name.includes("Natural") ||
        v.name.includes("Maria") ||
        v.name.includes("Daniel") ||
        v.name.includes("Francisca") ||
        v.name.includes("Luciana") ||
        v.name.includes("Antonio"))
  );
  if (naturalPt) return naturalPt;

  // 3. Qualquer voz pt-BR
  const anyPtBr = voices.find(
    (v) =>
      v.lang === "pt-BR" ||
      v.lang === "pt_BR" ||
      v.lang.toLowerCase() === "pt-br"
  );
  if (anyPtBr) return anyPtBr;

  // 4. Qualquer voz de língua portuguesa
  const anyPt = voices.find((v) => v.lang.toLowerCase().startsWith("pt"));
  if (anyPt) return anyPt;

  // 5. Fallback para default
  return voices.find((v) => v.default) || voices[0] || null;
}

// Estados e Controle do TTS
let currentTTSState: TTSState = "idle";
let activePlaybackId = 0;
let resumeInterval: any = null;
let activeChunks: string[] = [];
let currentChunkIndex = 0;
let onCurrentEndCallback: (() => void) | null = null;
let onCurrentStateCallback: ((state: TTSState) => void) | null = null;
let onCurrentErrorCallback: ((err: any) => void) | null = null;

function setTTSState(state: TTSState) {
  currentTTSState = state;
  onCurrentStateCallback?.(state);
}

export function getTTSState(): TTSState {
  return currentTTSState;
}

export function isSpeaking(): boolean {
  return currentTTSState === "playing";
}

export function isPaused(): boolean {
  return currentTTSState === "paused";
}

/**
 * Desbloqueia o motor de fala e Web Audio em navegadores móveis (iOS Safari / Android Chrome)
 * Deve ser chamado a partir de um gesto do usuário (clique / toque).
 */
export function unlockSpeechAudio(): void {
  if (typeof window === "undefined") return;
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.resume();
    }
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const dummyCtx = new AudioContextClass();
      if (dummyCtx.state === "suspended") {
        dummyCtx.resume().catch(() => {});
      }
      setTimeout(() => dummyCtx.close().catch(() => {}), 100);
    }
  } catch {}
}

export function stopSpeaking(): void {
  activePlaybackId++;
  if (resumeInterval) {
    clearInterval(resumeInterval);
    resumeInterval = null;
  }
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  (window as any).__kyreonActiveUtterance = null;
  activeChunks = [];
  currentChunkIndex = 0;
  setTTSState("stopped");
  setTimeout(() => {
    if (currentTTSState === "stopped") {
      setTTSState("idle");
    }
  }, 100);
}

export function pauseSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.pause();
    setTTSState("paused");
  } catch (err) {
    console.warn("[Kyreon Voice] Falha ao pausar:", err);
  }
}

export function resumeSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.resume();
    setTTSState("playing");
  } catch (err) {
    console.warn("[Kyreon Voice] Falha ao continuar áudio:", err);
  }
}

export function speakText(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: any) => void,
  onStateChange?: (state: TTSState) => void
): void {
  if (!isSpeechSynthesisSupported()) {
    onError?.("Síntese de voz não suportada neste navegador.");
    return;
  }

  // Interrompe qualquer reprodução prévia para evitar duplicatas
  stopSpeaking();

  const chunks = splitIntoSentenceChunks(text);
  if (!chunks.length) {
    onEnd?.();
    return;
  }

  activeChunks = chunks;
  currentChunkIndex = 0;
  onCurrentEndCallback = onEnd || null;
  onCurrentErrorCallback = onError || null;
  onCurrentStateCallback = onStateChange || null;

  const currentId = ++activePlaybackId;
  let hasStarted = false;

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch {}

  // Keep-alive para contornar bug do Chromium de 15 segundos
  if (resumeInterval) clearInterval(resumeInterval);
  resumeInterval = setInterval(() => {
    if (activePlaybackId !== currentId) {
      clearInterval(resumeInterval);
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.speechSynthesis &&
      window.speechSynthesis.speaking &&
      !window.speechSynthesis.paused
    ) {
      window.speechSynthesis.resume();
    }
  }, 2500);

  function speakNextChunk() {
    if (activePlaybackId !== currentId) return;

    if (currentChunkIndex >= activeChunks.length) {
      if (resumeInterval) {
        clearInterval(resumeInterval);
        resumeInterval = null;
      }
      (window as any).__kyreonActiveUtterance = null;
      setTTSState("idle");
      onCurrentEndCallback?.();
      return;
    }

    const chunkText = activeChunks[currentChunkIndex];
    currentChunkIndex++;

    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.lang = "pt-BR";
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    const ptVoice = getBestPortugueseVoice();
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    (window as any).__kyreonActiveUtterance = utterance;

    utterance.onstart = () => {
      if (activePlaybackId !== currentId) return;
      if (!hasStarted) {
        hasStarted = true;
        setTTSState("playing");
        onStart?.();
      }
    };

    utterance.onpause = () => {
      if (activePlaybackId !== currentId) return;
      setTTSState("paused");
    };

    utterance.onresume = () => {
      if (activePlaybackId !== currentId) return;
      setTTSState("playing");
    };

    utterance.onend = () => {
      if (activePlaybackId !== currentId) return;
      setTimeout(() => {
        speakNextChunk();
      }, 50);
    };

    utterance.onerror = (e) => {
      if (activePlaybackId !== currentId) return;
      console.warn("[Kyreon Voice] Utterance error:", e);
      if (e.error === "canceled" || e.error === "interrupted") {
        return;
      }
      setTimeout(() => {
        speakNextChunk();
      }, 50);
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("[Kyreon Voice] Falha ao chamar speak():", err);
      setTTSState("idle");
      onCurrentErrorCallback?.(err);
    }
  }

  // Delay de 60ms para aguardar o cancelamento assíncrono anterior ser concluído
  setTimeout(() => {
    if (activePlaybackId === currentId) {
      speakNextChunk();
    }
  }, 60);
}

// Teste rápido para validar o som do usuário
export function testKyreonVoice(
  onStart?: () => void,
  onEnd?: () => void
): void {
  playTestChime();
  setTimeout(() => {
    speakText(
      "Olá! Seu áudio e o Kyreon estão sincronizados e funcionando perfeitamente.",
      onStart,
      onEnd
    );
  }, 250);
}
