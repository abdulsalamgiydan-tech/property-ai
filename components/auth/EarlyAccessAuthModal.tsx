"use client";

import { useState, type FormEvent } from "react";

type EarlyAccessAuthModalProps = {
  open: boolean;
  onClose: () => void;
  authConfigured: boolean;
  sendMagicLink: (args: {
    email: string;
    firstName?: string;
    redirectPath: string;
  }) => Promise<{ ok: boolean; message?: string }>;
};

export function EarlyAccessAuthModal({
  open,
  onClose,
  authConfigured,
  sendMagicLink,
}: EarlyAccessAuthModalProps) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!open) return null;

  function resetForm() {
    setEmail("");
    setFirstName("");
    setError(null);
    setSent(false);
    setBusy(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email address.");
      return;
    }
    if (!authConfigured) {
      setError(
        "Magic links are not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server."
      );
      return;
    }

    setBusy(true);
    const path =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/";
    const res = await sendMagicLink({
      email: trimmed,
      firstName: firstName.trim() || undefined,
      redirectPath: path,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? "Something went wrong. Please try again.");
      return;
    }
    setSent(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="early-access-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={() => {
          resetForm();
          onClose();
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-700/90 bg-zinc-900/98 p-6 shadow-2xl shadow-black/60 backdrop-blur-md sm:p-8">
        <button
          type="button"
          onClick={() => {
            resetForm();
            onClose();
          }}
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close dialog"
        >
          <span aria-hidden className="text-lg leading-none">
            ×
          </span>
        </button>

        <h2
          id="early-access-title"
          className="pr-8 text-lg font-semibold tracking-tight text-white"
        >
          Get free early access
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          We&apos;ll email you a secure sign-in link — no password to remember.
        </p>

        {!authConfigured ? (
          <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
            Supabase environment variables are not set. The tools still work in preview mode; add your
            project URL and anon key to enable magic links.
          </p>
        ) : null}

        {sent ? (
          <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-4 text-sm leading-relaxed text-emerald-100/95">
            Check your email for a sign-in link.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block text-left">
              <span className="text-xs font-medium text-zinc-400">Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-600/80 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-violet-500/0 transition placeholder:text-zinc-600 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20"
                placeholder="you@example.com"
                required
              />
            </label>
            <label className="block text-left">
              <span className="text-xs font-medium text-zinc-400">
                First name <span className="font-normal text-zinc-600">(optional)</span>
              </span>
              <input
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-600/80 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-violet-500/0 transition placeholder:text-zinc-600 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20"
                placeholder="Alex"
              />
            </label>
            {error ? (
              <p className="text-xs leading-relaxed text-red-300" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40 disabled:cursor-wait disabled:opacity-80"
            >
              {busy ? (
                <>
                  <span
                    className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden
                  />
                  Sending link…
                </>
              ) : (
                "Get free early access"
              )}
            </button>
          </form>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
          Illustrative tools only — not financial, tax, or legal advice.
        </p>
      </div>
    </div>
  );
}
