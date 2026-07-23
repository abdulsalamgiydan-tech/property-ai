"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AU_STATES } from "@/lib/constants/au";
import { safeInternalNextPath } from "@/lib/auth/safeNextPath";
import { saveOnboardingPreferences, type OnboardingGoal } from "@/lib/supabase/onboardingPreferences";

const GOALS: { id: OnboardingGoal; label: string }[] = [
  { id: "investor", label: "I'm investing in property" },
  { id: "first_home_buyer", label: "I'm buying my first home" },
  { id: "researching", label: "I'm just researching the market" },
];

/**
 * Sprint 14 WS2 — a short, always-skippable, one-time onboarding step
 * shown right after first sign-in. Nothing here gates access to any
 * feature — every choice is a personalisation hint, never a
 * requirement. "Skip for now" is always available and equally prominent
 * to submitting the form.
 */
export function OnboardingClient({ nextPathRaw }: { nextPathRaw: string | null }) {
  const router = useRouter();
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const safeNextPath = safeInternalNextPath(nextPathRaw);
  const nextPath = !safeNextPath || safeNextPath === "/" ? "/dashboard" : safeNextPath;

  function toggleState(s: string) {
    setStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function handleContinue() {
    setSaving(true);
    await saveOnboardingPreferences(goal, states);
    // Always proceed regardless of save outcome — onboarding is a
    // personalisation nicety, never a blocker to using the product.
    router.replace(nextPath);
  }

  function handleSkip() {
    router.replace(nextPath);
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/85 p-8 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">Propellect</p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            A couple of quick questions
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Totally optional — this just helps us show you more relevant defaults. You can change or skip this any
            time.
          </p>

          <div className="mt-8 space-y-3">
            <p className="text-sm font-medium text-zinc-200">What brings you here?</p>
            <div className="space-y-2">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoal(g.id)}
                  aria-pressed={goal === g.id}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left text-sm transition ${
                    goal === g.id
                      ? "border-violet-500 bg-violet-950/30 text-violet-100"
                      : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:border-zinc-600"
                  }`}
                >
                  {g.label}
                  {goal === g.id ? (
                    <span aria-hidden className="shrink-0 text-violet-300">
                      ✓
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-zinc-200">
              Which states are you interested in? <span className="font-normal text-zinc-500">(optional, pick any)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {AU_STATES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleState(s)}
                  aria-pressed={states.includes(s)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    states.includes(s)
                      ? "border-violet-500 bg-violet-950/30 text-violet-100"
                      : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:border-zinc-600"
                  }`}
                >
                  {states.includes(s) ? <span aria-hidden>✓ </span> : null}
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleContinue}
              disabled={saving}
              className="inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-[11rem]"
            >
              {saving ? "Saving…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60 sm:w-auto"
            >
              Skip for now
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
