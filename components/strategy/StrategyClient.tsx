"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { StrategyForm } from "@/components/strategy/StrategyForm";
import { StrategyMarkdown } from "@/components/strategy/StrategyMarkdown";
import { StrategyResultCards } from "@/components/strategy/StrategyResultCards";
import type { StrategyInput } from "@/lib/strategy/strategyInput";
import type { StrategyOutput } from "@/lib/strategy/strategyOutput";
import Link from "next/link";
import { useEffect, useState } from "react";

const LOADING_MESSAGES = [
  "Reading your situation",
  "Selecting your archetype",
  "Drafting your strategy",
] as const;

const ROTATE_MS = 2500;

export function StrategyClient() {
  const { openEarlyAccessModal, user, loading: authLoading } = useAuth();
  const [result, setResult] = useState<StrategyOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => {
      setLoadingMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, ROTATE_MS);
    return () => window.clearInterval(t);
  }, [busy]);

  async function handleSubmit(input: StrategyInput) {
    setError(null);
    setResult(null);
    setBusy(true);
    setLoadingMsgIndex(0);

    try {
      const res = await fetch("/api/strategy/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const data = (await res.json()) as StrategyOutput | { error?: string; retry_after_days?: number };

      if (!res.ok) {
        if (res.status === 401) {
          openEarlyAccessModal();
          setError("Please sign in to generate a strategy.");
        } else if (res.status === 429 && "retry_after_days" in data) {
          setError(
            `You have reached the free limit of generations this week. Try again in about ${data.retry_after_days} day(s).`
          );
        } else if (res.status === 400) {
          setError("Some fields need fixing. Check highlighted inputs.");
        } else {
          setError("We could not generate a strategy right now. Please try again shortly.");
        }
        return;
      }

      setResult(data as StrategyOutput);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs font-medium text-violet-400/90 transition hover:text-violet-300"
        >
          ← Back to tools
        </Link>

        <header className="mt-6 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
            Strategy generator
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Build your investment strategy
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            We select one of twelve archetypes from your answers — then draft a personalised Australian
            residential property strategy. General information only, not personal advice.
          </p>
          {!authLoading && !user ? (
            <p className="mt-2 text-xs text-amber-200/90">
              Session expired or unavailable —{" "}
              <button
                type="button"
                onClick={openEarlyAccessModal}
                className="font-medium text-violet-400 underline-offset-2 hover:underline"
              >
                sign in again
              </button>
              .
            </p>
          ) : null}
        </header>

        {error ? (
          <div
            className="mt-6 rounded-xl border border-amber-500/30 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12 lg:items-start">
          <div
            className={`min-w-0 rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8 ${
              busy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <StrategyForm onSubmit={handleSubmit} disabled={busy} />
          </div>

          <div className="min-w-0 space-y-6 lg:sticky lg:top-8 lg:self-start">
            {busy && (
              <output
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-violet-500/40 bg-violet-950/20 px-6 py-16 text-center"
                aria-live="polite"
              >
                <span
                  className="size-8 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400"
                  aria-hidden
                />
                <span className="text-sm font-medium text-violet-200">
                  {LOADING_MESSAGES[loadingMsgIndex]}
                </span>
              </output>
            )}

            {!busy && !result && (
              <div className="rounded-2xl border border-dashed border-zinc-600/45 bg-zinc-900/35 px-6 py-16 text-center">
                <p className="text-sm font-medium text-zinc-300">Your strategy will appear here</p>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
                  Complete the questionnaire, then tap <span className="font-medium text-zinc-300">Generate strategy</span>.
                </p>
              </div>
            )}

            {result && !busy ? (
              <div className="space-y-8">
                <StrategyResultCards output={result} />
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Full strategy
                  </h3>
                  <StrategyMarkdown markdown={result.full_strategy_markdown} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <p className="mx-auto mt-12 max-w-3xl text-center text-[11px] leading-relaxed text-zinc-500">
          Archetype selection is deterministic in software — the model personalises the chosen path only.
          Not financial, tax, or legal advice.
        </p>
      </div>
    </div>
  );
}
