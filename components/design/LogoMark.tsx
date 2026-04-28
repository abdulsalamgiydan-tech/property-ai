import React from "react";

type LogoMarkProps = {
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
};

export function LogoMark({ size = 30, showWordmark = true, wordmarkClassName }: LogoMarkProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <defs>
          <linearGradient id="propellect-mark-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#4C1D95" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#propellect-mark-gradient)" />
        <line
          x1="8.5"
          y1="23.5"
          x2="23.5"
          y2="8.5"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="8.5" cy="23.5" r="2" fill="rgba(255,255,255,0.45)" />
        <circle cx="23.5" cy="8.5" r="3.2" fill="#34D399" />
      </svg>
      {showWordmark ? (
        <span
          className={
            wordmarkClassName ?? "text-base font-semibold tracking-tight text-zinc-100"
          }
        >
          Propellect
        </span>
      ) : null}
    </span>
  );
}
