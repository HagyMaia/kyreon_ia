// Voice Service: Speech Recognition (STT) & Speech Synthesis (TTS)
// Otimizado com correções específicas para Chromium, Windows SAPI, e quebras de sentença contínuas.

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
  errorType?: "not_allowed" | "not_found" | "unsupported" | "other";
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
      activeMicrophoneStream.getTracks().forEach((track) => track.stop());
    } catch {}
    activeMicrophoneStream = null;
  }
}

export async function requestMicrophoneAccess(preferredDeviceId?: string): Promise<MicrophoneAccessResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      errorType: "unsupported",
      error: "Seu navegador não possui suporte à captura de áudio pelo microfone.",
    };
  }

  // Se já temos stream ativo e funcionando, reutiliza sem reiniciar conexão Bluetooth
  if (activeMicrophoneStream && activeMicrophoneStream.active) {
    return { granted: true };
  }

  // 1. Tenta acesso direto ao dispositivo
  try {
    const constraints: MediaStreamConstraints = preferredDeviceId
      ? { audio: { deviceId: { exact: preferredDeviceId } } }
      : { audio: true };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    activeMicrophoneStream = stream;
    return { granted: true };
  } catch (err: any) {
    console.warn("[Kyreon Voice] Tentativa direta de microfone falhou:", err);

    // 2. Diagnóstico de dispositivos conectados
    let devices: MediaDeviceInfo[] = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {}

    const audioInputs = devices.filter((d) => d.kind === "audioinput");
    const audioOutputs = devices.filter((d) => d.kind === "audiooutput");

    // 3. Tenta qualquer entrada de áudio válida (ex: Headset Bluetooth)
    for (const dev of audioInputs) {
      if (dev.deviceId && dev.deviceId !== "default") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: dev.deviceId } },
          });
          activeMicrophoneStream = stream;
          return { granted: true };
        } catch {}
      }
    }

    const hasOutput = audioOutputs.length > 0 || devices.length > 0;

    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return {
        granted: false,
        hasHeadphoneOutput: hasOutput,
        errorType: "not_allowed",
        error:
          "Permissão de microfone bloqueada pelo navegador. Clique no ícone de cadeado na barra de endereços (ao lado de localhost:5173) e ative a permissão de Microfone.",
      };
    }

    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return {
        granted: false,
        hasHeadphoneOutput: hasOutput,
        errorType: "not_found",
        detectedInputs: audioInputs.map((d) => d.label || "Microfone"),
        detectedOutputs: audioOutputs.map((d) => d.label || "Fone / Alto-falante"),
        error: hasOutput
          ? "Seu fone está conectado para saída de áudio (você ouve o Kyreon falar), mas a entrada de microfone Hands-Free precisa estar ativa no Windows."
          : "Nenhum microfone detectado no computador.",
      };
    }

    return {
      granted: false,
      hasHeadphoneOutput: hasOutput,
      errorType: "other",
      error: `Não foi possível acessar o microfone: ${err.message || err.name}`,
    };
  }
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
      // Normalização de 0.0 a 1.0
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
}

export function createSpeechRecognition(options: {
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  onEnd: () => void;
  onAudioStart?: () => void;
}): SpeechRecognitionController | null {
  if (!isSpeechRecognitionSupported()) {
    options.onError(
      "O reconhecimento de voz nativo não é suportado pelo seu navegador atual. Recomendamos o Google Chrome ou Microsoft Edge."
    );
    return null;
  }

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  let recognition: any;
  let isExplicitlyStopped = false;
  let restartTimeout: any = null;

  try {
    recognition = new SpeechRecognitionClass();
  } catch (err) {
    options.onError("Falha ao instanciar o serviço de voz do navegador.");
    return null;
  }

  recognition.lang = "pt-BR";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  if (options.onAudioStart) {
    recognition.onaudiostart = () => {
      options.onAudioStart?.();
    };
  }

  // Processamento determinístico de todos os resultados da sessão
  recognition.onresult = (event: any) => {
    let interimTranscript = "";
    let finalTranscript = "";
    let hasFinal = false;

    for (let i = 0; i < event.results.length; ++i) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript + " ";
        hasFinal = true;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    const fullTranscript = (finalTranscript + interimTranscript).trim();
    if (fullTranscript) {
      options.onTranscript(fullTranscript, hasFinal && interimTranscript.trim() === "");
    }
  };

  recognition.onerror = (event: any) => {
    console.warn("[Kyreon Voice] Recognition error event:", event.error);
    if (isExplicitlyStopped) return;

    switch (event.error) {
      case "not-allowed":
      case "service-not-allowed":
        options.onError(
          "Permissão de microfone bloqueada. Clique no cadeado da barra de endereço e libere o microfone para este site."
        );
        break;
      case "network":
        options.onError(
          "Erro de conexão com o serviço de voz. Verifique sua conexão com a internet."
        );
        break;
      case "no-speech":
        // Pausa na fala do usuário. Mantém a escuta contínua ativa
        console.log("[Kyreon Voice] Nenhuma fala captada no intervalo recente.");
        break;
      case "audio-capture":
        options.onError(
          "Microfone não encontrado ou ocupado por outro programa. Verifique se o fone está conectado."
        );
        break;
      default:
        console.log("[Kyreon Voice] Evento de áudio:", event.error);
        break;
    }
  };

  recognition.onend = () => {
    // Se não foi interrompido explicitamente pelo usuário, reinicia suavemente para manter escuta contínua
    if (!isExplicitlyStopped) {
      if (restartTimeout) clearTimeout(restartTimeout);
      restartTimeout = setTimeout(() => {
        if (!isExplicitlyStopped) {
          try {
            recognition.start();
          } catch (err) {
            console.warn("[Kyreon Voice] Auto-restart silencioso ignorado:", err);
            options.onEnd();
          }
        }
      }, 150);
    } else {
      options.onEnd();
    }
  };

  return {
    start: () => {
      isExplicitlyStopped = false;
      if (restartTimeout) clearTimeout(restartTimeout);
      try {
        recognition.start();
      } catch (err: any) {
        console.warn("[Kyreon Voice] Recognition already started or error:", err);
      }
    },
    stop: () => {
      isExplicitlyStopped = true;
      if (restartTimeout) clearTimeout(restartTimeout);
      try {
        recognition.stop();
      } catch {}
    },
    abort: () => {
      isExplicitlyStopped = true;
      if (restartTimeout) clearTimeout(restartTimeout);
      try {
        recognition.abort();
      } catch {}
    },
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
      ctx.resume();
    }

    const now = ctx.currentTime;
    // Nota 1 (E5 - 659Hz)
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

    // Nota 2 (A5 - 880Hz)
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
    console.warn("[Kyreon Voice] Falha ao tocar chime Web Audio:", err);
  }
}

// ==========================================================================
// TEXT-TO-SPEECH (TTS) - SPEECH SYNTHESIS ROBUSTO
// ==========================================================================

function cleanTextForSpeech(text: string): string {
  return text
    // Remove blocos de código
    .replace(/```[\s\S]*?```/g, " Bloco de código omitido. ")
    // Remove tags HTML
    .replace(/<[^>]+>/g, " ")
    // Remove código inline
    .replace(/`([^`]+)`/g, "$1")
    // Remove formatações markdown
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[\*\-]\s+/gm, "")
    // Remove emojis que causam leitura bizarra
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    // Normaliza espaços
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoSentenceChunks(text: string): string[] {
  const clean = cleanTextForSpeech(text);
  if (!clean) return [];

  // Quebra por pontos, exclamações, interrogações ou novas linhas
  const rawParts = clean.match(/[^.!?;\n]+[.!?;\n]*/g) || [clean];
  const chunks: string[] = [];

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Se o pedaço ainda for muito longo (> 170 caracteres), divide em vírgulas
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

  // 2. Microsoft Maria / Daniel / Francisca / Antonio / Natural (Edge / Windows 10/11)
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

  // 4. Qualquer voz portuguesa
  const anyPt = voices.find((v) => v.lang.toLowerCase().startsWith("pt"));
  if (anyPt) return anyPt;

  // 5. Fallback para default
  return voices.find((v) => v.default) || voices[0] || null;
}

let activePlaybackId = 0;
let resumeInterval: any = null;

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
}

export function isSpeaking(): boolean {
  return isSpeechSynthesisSupported() && window.speechSynthesis.speaking;
}

export function speakText(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: any) => void
): void {
  if (!isSpeechSynthesisSupported()) {
    console.warn("[Kyreon Voice] Speech synthesis não suportado.");
    onError?.("Síntese de voz não suportada neste navegador.");
    return;
  }

  // Interrompe qualquer reprodução anterior
  stopSpeaking();

  const chunks = splitIntoSentenceChunks(text);
  if (!chunks.length) {
    onEnd?.();
    return;
  }

  const currentId = ++activePlaybackId;
  let chunkIndex = 0;
  let hasStarted = false;

  // Garante que o sintetizador não esteja travado em paused
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch {}

  // Intervalo de "keep-alive" para contornar o bug do Chrome que congela após 15 segundos
  if (resumeInterval) clearInterval(resumeInterval);
  resumeInterval = setInterval(() => {
    if (activePlaybackId !== currentId) {
      clearInterval(resumeInterval);
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.speechSynthesis &&
      window.speechSynthesis.speaking
    ) {
      window.speechSynthesis.resume();
    }
  }, 2500);

  function speakNextChunk() {
    if (activePlaybackId !== currentId) return;

    if (chunkIndex >= chunks.length) {
      if (resumeInterval) {
        clearInterval(resumeInterval);
        resumeInterval = null;
      }
      (window as any).__kyreonActiveUtterance = null;
      onEnd?.();
      return;
    }

    const chunkText = chunks[chunkIndex];
    chunkIndex++;

    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.lang = "pt-BR";
    utterance.rate = 1.05; // Ritmo agradável e natural
    utterance.pitch = 1.0;

    const ptVoice = getBestPortugueseVoice();
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    // Salva referência global no window para evitar o Garbage Collector do V8
    (window as any).__kyreonActiveUtterance = utterance;

    utterance.onstart = () => {
      if (activePlaybackId !== currentId) return;
      if (!hasStarted) {
        hasStarted = true;
        onStart?.();
      }
    };

    utterance.onend = () => {
      if (activePlaybackId !== currentId) return;
      // Pequena pausa entre orações para soabilidade humana
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
      // Se der erro numa frase, tenta a próxima para não abortar todo o áudio
      setTimeout(() => {
        speakNextChunk();
      }, 50);
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("[Kyreon Voice] Falha ao chamar speak():", err);
      onError?.(err);
    }
  }

  // Delay de 60ms para aguardar o cancelamento assíncrono do Chrome ser processado
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
      "Olá Hagy! Seu fone de ouvido e o áudio do Kyreon estão conectados e funcionando perfeitamente.",
      onStart,
      onEnd
    );
  }, 250);
}
