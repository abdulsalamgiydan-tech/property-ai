import React, { type ReactNode } from "react";

type SectionCardProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionCard({ title, description, actions, children, className }: SectionCardProps) {
  return (
    <section
      className={`rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-5 shadow-xl shadow-black/25 backdrop-blur-md sm:p-6 ${className ?? ""}`}
    >
      {title || description || actions ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? (
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">{title}</h2>
            ) : null}
            {description ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
