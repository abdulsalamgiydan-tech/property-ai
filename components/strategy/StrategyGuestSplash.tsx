"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { CTAButton } from "@/components/design/CTAButton";
import Link from "next/link";

export function StrategyGuestSplash() {
  const { loading, openEarlyAccessModal } = useAuth();

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
          Strategy generator
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Your personalised property investment strategy
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          Answer a structured questionnaire about your situation, goals, and preferences. We select one
          of twelve investment archetypes in code — then draft a written strategy tailored to you. Sign in
          to run the generator and save results to your account.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {loading ? (
            <span className="text-sm text-zinc-500">Checking session…</span>
          ) : (
            <CTAButton className="px-6 py-3 text-sm" onClick={openEarlyAccessModal}>
              Sign in / Get started
            </CTAButton>
          )}
          <Link
            href="/"
            className="rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60"
          >
            Back to tools
          </Link>
        </div>
        <p className="mt-10 text-[11px] leading-relaxed text-zinc-600">
          General information only, not personal financial advice. Australian residential property focus.
        </p>
      </div>
    </div>
  );
}
