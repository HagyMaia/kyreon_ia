import { useState } from "react";

interface KyreonAvatarProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  glow?: boolean;
  showStatus?: boolean;
}

const SIZE_MAP = {
  xs: 24,
  sm: 34,
  md: 44,
  lg: 60,
  xl: 96,
};

export function KyreonAvatar({
  size = "md",
  className = "",
  glow = true,
  showStatus = false,
}: KyreonAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const px = SIZE_MAP[size];

  return (
    <div
      className={`kyreon-avatar-container kyreon-avatar-${size} ${glow ? "glow-effect" : ""} ${className}`}
      style={{ width: px, height: px }}
    >
      {!imgError ? (
        <img
          src="/kyreon-avatar.png?v=2"
          alt="Kyreon AI"
          className="kyreon-avatar-img"
          onError={() => setImgError(true)}
        />
      ) : (
        <svg
          viewBox="0 0 100 100"
          className="kyreon-avatar-svg"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="robotBody" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
            <linearGradient id="robotScreen" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>
            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Fundo escuro */}
          <circle cx="50" cy="50" r="48" fill="#090d16" />

          {/* Fones de ouvido / sensores laterais */}
          <rect x="10" y="36" width="12" height="28" rx="6" fill="#e2e8f0" stroke="#06b6d4" strokeWidth="1" />
          <rect x="78" y="36" width="12" height="28" rx="6" fill="#e2e8f0" stroke="#06b6d4" strokeWidth="1" />
          <circle cx="16" cy="50" r="2" fill="#06b6d4" />
          <circle cx="84" cy="50" r="2" fill="#06b6d4" />

          {/* Cabeça do robô */}
          <rect x="20" y="18" width="60" height="64" rx="28" fill="url(#robotBody)" stroke="#94a3b8" strokeWidth="1.5" />

          {/* Visor digital escuro */}
          <rect x="26" y="28" width="48" height="42" rx="18" fill="url(#robotScreen)" />

          {/* Olhos amigáveis em neon ciano */}
          <ellipse cx="40" cy="45" rx="5.5" ry="6.5" fill="#22d3ee" filter="url(#neonGlow)" />
          <ellipse cx="60" cy="45" rx="5.5" ry="6.5" fill="#22d3ee" filter="url(#neonGlow)" />

          {/* Sorriso do robô */}
          <path
            d="M42 56 Q50 63 58 56"
            stroke="#22d3ee"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            filter="url(#neonGlow)"
          />
        </svg>
      )}

      {showStatus && <span className="avatar-online-status" title="Kyreon Online" />}
    </div>
  );
}
