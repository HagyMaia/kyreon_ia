import { ArrowUp, Paperclip } from "lucide-react";
import { FormEvent, KeyboardEvent, useState } from "react";

interface ChatInputProps {
  loading: boolean;
  onSend: (message: string) => void;
  placeholder?: string;
}

export function ChatInput({ loading, onSend, placeholder }: ChatInputProps) {
  const [value, setValue] = useState("");

  function submit(event?: FormEvent) {
    if (event) event.preventDefault();

    const message = value.trim();
    if (!message || loading) return;

    onSend(message);
    setValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <button
        type="button"
        className="icon-button"
        title="Anexar arquivo (RAG)"
        onClick={() => alert("Módulo de upload de arquivos e RAG será conectado na próxima etapa!")}
      >
        <Paperclip size={19} />
      </button>

      <textarea
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Envie uma mensagem para o agente (Shift+Enter para pular linha)..."}
        disabled={loading}
      />

      <button
        className="send-button"
        type="submit"
        disabled={loading || !value.trim()}
        title="Enviar mensagem"
      >
        <ArrowUp size={19} />
      </button>
    </form>
  );
}
