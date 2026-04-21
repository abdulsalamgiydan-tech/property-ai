"use client";

import type { ReactNode } from "react";

type GatedBlurProps = {
  locked: boolean;
  overlay: ReactNode;
  children: ReactNode;
  className?: string;
};

export function GatedBlur({ locked, overlay, children, className }: GatedBlurProps) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        className={
          locked
            ? "pointer-events-none max-h-[min(70vh,520px)] overflow-hidden select-none blur-[2.5px] opacity-[0.72]"
            : undefined
        }
        aria-hidden={locked ? true : undefined}
      >
        {children}
      </div>
      {locked ? (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-gradient-to-b from-zinc-950/55 via-zinc-950/75 to-zinc-950/90 p-4 sm:p-6">
          {overlay}
        </div>
      ) : null}
    </div>
  );
}
