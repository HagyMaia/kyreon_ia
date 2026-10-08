import type { Agent, ModelInfo, ToolInfo } from "../types";

export const DEFAULT_FALLBACK_AGENTS: Agent[] = [
  {
    id: "default-assistant",
    name: "Kyreon Orquestrador & Assistente",
    role: "Orquestrador Central & IA Geral",
    description:
      "Orquestrador da plataforma Kyreon. Responde a dúvidas gerais, consulta clima de Manaus, salva preferências na memória e delega tarefas técnicas.",
    system_prompt:
      "Você é o Kyreon, assistente de IA e Orquestrador Central da plataforma Kyreon AI.",
    provider: "gemini",
    model: "gemini-2.0-flash",
    temperature: 0.7,
    tools: [
      "get_current_datetime",
      "calculator",
      "web_search",
      "get_manaus_weather",
      "save_user_memory",
      "delegate_to_specialist",
    ],
    avatar: "✦",
    is_default: true,
  },
  {
    id: "code-architect",
    name: "Arquiteto de Software",
    role: "Especialista em Engenharia & Código",
    description:
      "Focado em desenvolvimento de software, arquitetura de sistemas, Python, TypeScript e boas práticas.",
    system_prompt:
      "Você é um Engenheiro de Software Sênior e Arquiteto de Soluções experiente da equipe Kyreon.",
    provider: "gemini",
    model: "gemini-2.0-flash",
    temperature: 0.3,
    tools: ["calculator", "get_current_datetime", "web_search"],
    avatar: "💻",
    is_default: false,
  },
  {
    id: "researcher",
    name: "Pesquisador & Analista",
    role: "Análise Crítica & Síntese de Dados",
    description:
      "Especializado em investigação detalhada, busca de dados e relatórios fundamentados.",
    system_prompt:
      "Você é um pesquisador e analista analítico da equipe Kyreon.",
    provider: "gemini",
    model: "gemini-2.0-flash",
    temperature: 0.4,
    tools: ["web_search", "get_current_datetime"],
    avatar: "🔍",
    is_default: false,
  },
  {
    id: "manaus-specialist",
    name: "Guia & Especialista Amazônico",
    role: "Geografia, Clima & Polo de Manaus",
    description:
      "Especialista regional em Manaus, ecossistema amazônico, clima, história, Polo Industrial (PIM) e cultura local.",
    system_prompt:
      "Você é o Especialista Regional Amazônico da equipe Kyreon.",
    provider: "gemini",
    model: "gemini-2.0-flash",
    temperature: 0.5,
    tools: ["get_manaus_weather", "get_current_datetime", "web_search"],
    avatar: "🌿",
    is_default: false,
  },
];

export const DEFAULT_FALLBACK_MODELS: ModelInfo[] = [
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "gemini",
    context_window: 1048576,
    description: "Modelo multimodal de última geração do Google, ultra-rápido com 1M tokens de contexto.",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    context_window: 128000,
    description: "Modelo eficiente e inteligente da OpenAI com alta velocidade.",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    context_window: 128000,
    description: "Modelo emblemático de alta capacidade e raciocínio avançado da OpenAI.",
  },
];

export const DEFAULT_FALLBACK_TOOLS: ToolInfo[] = [
  {
    id: "get_manaus_weather",
    name: "get_manaus_weather",
    description: "Consulta temperatura, clima, umidade e sensação térmica de Manaus - AM.",
  },
  {
    id: "calculator",
    name: "calculator",
    description: "Executa expressões matemáticas e cálculos avançados.",
  },
  {
    id: "get_current_datetime",
    name: "get_current_datetime",
    description: "Obtém data, hora e fuso horário oficial.",
  },
  {
    id: "web_search",
    name: "web_search",
    description: "Pesquisa na web por notícias, dados recentes e fontes externas.",
  },
];

export function generateSimulatedResponse(
  userMessage: string,
  agent?: Agent
): string {
  const agentName = agent?.name || "Kyreon";
  const agentRole = agent?.role || "Assistente Inteligente";
  const lower = userMessage.toLowerCase().trim();

  let responseBody = "";

  if (lower.includes("olá") || lower.includes("ola") || lower.includes("oi") || lower.includes("bom dia") || lower.includes("boa tarde") || lower.includes("boa noite")) {
    responseBody = `Olá! Sou o **${agentName}** (${agentRole}).\n\nComo posso ajudar você hoje? Você pode me perguntar sobre código, análise de dados, clima de Manaus ou testar comandos de voz e áudio!`;
  } else if (lower.includes("clima") || lower.includes("manaus") || lower.includes("tempo")) {
    responseBody = `🌦️ **Previsão em Manaus - AM (Simulação)**:\n- **Temperatura:** 31°C (Sensação térmica: 37°C)\n- **Condição:** Parcialmente nublado com pancadas de chuva típicas da tarde\n- **Umidade:** 82%\n- **Ventos:** 8 km/h\n\n*Nota: O clima equatorial amazônico é marcado pelo calor úmido e chuvas passageiras.*`;
  } else if (lower.includes("código") || lower.includes("codigo") || lower.includes("python") || lower.includes("react") || lower.includes("api") || lower.includes("typescript")) {
    responseBody = `💻 **Análise Técnica (${agentName})**:\n\nAqui está um exemplo de integração robusta com TypeScript:\n\n\`\`\`typescript\ninterface ApiResponse<T> {\n  data: T;\n  status: "success" | "error";\n  timestamp: string;\n}\n\nasync function queryKyreon(prompt: string): Promise<ApiResponse<string>> {\n  const res = await fetch("/api/agent/chat", {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({ message: prompt }),\n  });\n  return res.json();\n}\n\`\`\`\n\nQual parte da arquitetura você gostaria de explorar em detalhes?`;
  } else if (lower.includes("ajuda") || lower.includes("help") || lower.includes("comandos")) {
    responseBody = `🛠️ **Recursos Disponíveis no Kyreon**:\n\n1. 🎤 **Microfone e Voz:** Toque no microfone para falar em tempo real.\n2. 🔊 **Leitura de Áudio (TTS):** Toque no alto-falante das respostas para ouvir a leitura.\n3. 🤖 **Múltiplos Agentes:** Crie e alterne entre especialistas no menu lateral.\n4. ⚙️ **Configurações:** Monitore modelos, banco de dados e ajuste a URL da API.`;
  } else {
    responseBody = `Compreendi sua mensagem sobre: "*${userMessage}*".\n\nComo seu **${agentRole}**, analisei o pedido e estou pronto para agir. Caso queira conectar aos modelos reais do Google Gemini ou OpenAI com busca web ativa, certifique-se de que o backend FastAPI esteja rodando localmente ou configurado na nuvem!`;
  }

  return responseBody;
}
