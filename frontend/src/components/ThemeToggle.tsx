import { Sun, Moon } from "lucide-react";

interface ThemeToggleProps {
  theme: "dark" | "light";
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      className="theme-toggle-btn"
      onClick={onToggle}
      title={theme === "dark" ? "Mudar para Modo Claro" : "Mudar para Modo Escuro"}
      aria-label="Alternar tema"
    >
      <div className="theme-toggle-slider">
        {theme === "dark" ? (
          <>
            <Moon size={15} className="theme-icon moon-icon" />
            <span className="theme-label">Escuro</span>
          </>
        ) : (
          <>
            <Sun size={15} className="theme-icon sun-icon" />
            <span className="theme-label">Claro</span>
          </>
        )}
      </div>
    </button>
  );
}
