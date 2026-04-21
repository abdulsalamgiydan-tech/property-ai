"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export function InfoButton({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <span ref={wrapRef} className="group/info relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-600/70 bg-zinc-800/50 text-[10px] font-semibold text-zinc-400 transition hover:border-violet-500/45 hover:bg-zinc-800 hover:text-violet-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/45"
        aria-label={`About ${label}`}
        aria-describedby={tooltipId}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden className="leading-none">
          i
        </span>
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`absolute right-0 top-full z-40 mt-1 w-[min(18rem,calc(100vw-3rem))] rounded-lg border border-zinc-600/80 bg-zinc-950 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-300 shadow-xl shadow-black/50 ring-1 ring-zinc-800/80 md:left-1/2 md:right-auto md:w-72 md:-translate-x-1/2 md:transition-opacity md:duration-150 ${
          open ? "block" : "hidden"
        } md:block md:pointer-events-none ${
          open ? "md:opacity-100 md:pointer-events-auto" : "md:opacity-0"
        } md:group-hover/info:pointer-events-auto md:group-hover/info:opacity-100 md:group-focus-within/info:pointer-events-auto md:group-focus-within/info:opacity-100`}
      >
        {children}
      </span>
    </span>
  );
}

export function FormSectionHeading({
  title,
  infoLabel,
  children,
}: {
  title: string;
  infoLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h2>
      <InfoButton label={infoLabel}>{children}</InfoButton>
    </div>
  );
}

export function RequiredMark() {
  return (
    <span className="text-violet-400/90" aria-hidden="true">
      {" "}
      *
    </span>
  );
}
