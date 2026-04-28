import React, { type ReactNode } from "react";

type GlassPillProps = {
  children: ReactNode;
  dark?: boolean;
  className?: string;
};

export function GlassPill({ children, dark = true, className }: GlassPillProps) {
  return (
    <span
      className={`relative inline-flex min-h-11 min-w-11 items-center justify-center overflow-hidden rounded-full border px-3 backdrop-blur-xl ${
        dark
          ? "border-white/15 bg-zinc-600/25 text-zinc-100"
          : "border-black/10 bg-white/55 text-zinc-900"
      } ${className ?? ""}`}
    >
      <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/20" aria-hidden />
      <span className="relative z-[1]">{children}</span>
    </span>
  );
}
