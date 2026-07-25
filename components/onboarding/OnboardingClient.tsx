"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AU_STATES } from "@/lib/constants/au";
import { safeInternalNextPath } from "@/lib/auth/safeNextPath";
import { trackEvent } from "@/lib/analytics/events";
import {
  budgetRangeOptions,
  buyerContextOptions,
  depositRangeOptions,
  guidanceLevelOptions,
  onboardingDefaults,
  onboardingGoals,
  portfolioStatusOptions,
  preferenceSummary,
  propertyTypeOptions,
  riskToleranceOptions,
  strategyFocusOptions,
  timeframeOptions,
  type OnboardingPreferences,
} from "@/lib/onboarding/preferences";
import { getOnboardingPreferences, saveOnboardingPreferences } from "@/lib/supabase/onboardingPreferences";

const labels: Record<string, string> = {
  investor: "Investor",
  first_home_buyer: "First-home buyer",
  researching: "Researching",
  owner_occupier: "Owner occupier",
  balanced: "Balanced",
  capital_growth: "Capital growth",
  cash_flow: "Cash flow",
  conservative: "Conservative",
  higher_growth: "Higher growth",
  "0_2_years": "0-2 years",
  "3_5_years": "3-5 years",
  "6_10_years": "6-10 years",
  "10_plus_years": "10+ years",
  under_500k: "Under $500k",
  "500k_750k": "$500k-$750k",
  "750k_1m": "$750k-$1m",
  "1m_1_5m": "$1m-$1.5m",
  "1_5m_plus": "$1.5m+",
  not_sure: "Not sure yet",
  under_100k: "Under $100k",
  "100k_200k": "$100k-$200k",
  "200k_350k": "$200k-$350k",
  "350k_plus": "$350k+",
  none: "No portfolio yet",
  one_property: "One property",
  two_to_four: "Two to four",
  five_plus: "Five or more",
  light: "Light guidance",
  guided: "Guided workflow",
  detailed: "Detailed explanations",
  weekly: "Weekly",
  monthly: "Monthly",
  house: "House",
  townhouse: "Townhouse",
  apartment: "Apartment",
  duplex: "Duplex",
  land: "Land",
};

function Choice({ selected, children, onClick }: { selected: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition sm:text-sm ${
        selected ? "border-violet-500 bg-violet-950/35 text-violet-100" : "border-zinc-700 bg-zinc-950/45 text-zinc-300 hover:border-zinc-600"
      }`}
    >
      {children}
    </button>
  );
}

function ChoiceGrid<T extends string>({
  title,
  values,
  selected,
  onSelect,
}: {
  title: string;
  values: readonly T[];
  selected: T | null | undefined;
  onSelect: (value: T) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {values.map((value) => (
          <Choice key={value} selected={selected === value} onClick={() => onSelect(value)}>
            {labels[value] ?? value}
          </Choice>
        ))}
      </div>
    </div>
  );
}

export function OnboardingClient({ nextPathRaw, mode = "onboarding" }: { nextPathRaw: string | null; mode?: "onboarding" | "settings" }) {
  const router = useRouter();
  const [preferences, setPreferences] = useState<OnboardingPreferences>(onboardingDefaults());
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(mode === "settings");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const source = mode;
  const totalSteps = 4;
  const safeNextPath = safeInternalNextPath(nextPathRaw);
  const nextPath = !safeNextPath || safeNextPath === "/" ? "/dashboard" : safeNextPath;
  const summary = useMemo(() => preferenceSummary(preferences), [preferences]);

  useEffect(() => {
    trackEvent({ name: "onboarding_started", source });
    if (mode !== "settings") return;
    let cancelled = false;
    void (async () => {
      const result = await getOnboardingPreferences();
      if (cancelled) return;
      setPreferences(result.preferences);
      setStep(Math.min(Math.max(result.preferences.completionStep || 1, 1), totalSteps));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, source]);

  function patch(next: Partial<OnboardingPreferences>) {
    setSaved(false);
    setPreferences((prev) => ({ ...prev, ...next, skipped: false }));
  }

  function toggleState(value: string) {
    patch({
      statesOfInterest: preferences.statesOfInterest.includes(value)
        ? preferences.statesOfInterest.filter((item) => item !== value)
        : [...preferences.statesOfInterest, value],
    });
  }

  function togglePropertyType(value: (typeof propertyTypeOptions)[number]) {
    patch({
      preferredPropertyTypes: preferences.preferredPropertyTypes.includes(value)
        ? preferences.preferredPropertyTypes.filter((item) => item !== value)
        : [...preferences.preferredPropertyTypes, value],
    });
  }

  async function persist(skipped: boolean) {
    setSaving(true);
    setErrorMessage(null);
    const result = await saveOnboardingPreferences({ ...preferences, completionStep: skipped ? step : totalSteps, skipped, editedFrom: source });
    setSaving(false);
    if (!result.ok) {
      setErrorMessage(result.message ?? "Could not save preferences. Your answers are still on this page.");
      return;
    }
    trackEvent(skipped ? { name: "onboarding_skipped", source } : { name: "onboarding_completed", source, completionStep: totalSteps });
    setSaved(true);
    if (mode === "onboarding") router.replace(nextPath);
  }

  async function handleContinue() {
    if (step < totalSteps) {
      setStep((current) => current + 1);
      return;
    }
    await persist(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-zinc-950">
        <span className="size-8 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/85 p-5 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">Propellect</p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {mode === "settings" ? "Investment preferences" : "Set up your investment profile"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Optional answers help personalise defaults and explanations. Propellect does not use these answers to make financial recommendations.
          </p>

          <div className="mt-6" aria-label={`Step ${step} of ${totalSteps}`}>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Step {step} of {totalSteps}</span>
              <span>{Math.round((step / totalSteps) * 100)}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-zinc-800">
              <div className="h-2 rounded-full bg-violet-500 transition-all" style={{ width: `${(step / totalSteps) * 100}%` }} />
            </div>
          </div>

          <div className="mt-8 space-y-6">
            {step === 1 ? (
              <>
                <ChoiceGrid title="What brings you here?" values={onboardingGoals} selected={preferences.primaryGoal} onSelect={(value) => patch({ primaryGoal: value, buyerContext: value === "first_home_buyer" ? "first_home_buyer" : preferences.buyerContext })} />
                <ChoiceGrid title="Strategy emphasis" values={strategyFocusOptions} selected={preferences.strategyFocus} onSelect={(value) => patch({ strategyFocus: value })} />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <ChoiceGrid title="Investment timeframe" values={timeframeOptions} selected={preferences.investmentTimeframe} onSelect={(value) => patch({ investmentTimeframe: value })} />
                <ChoiceGrid title="Indicative budget" values={budgetRangeOptions} selected={preferences.budgetRange} onSelect={(value) => patch({ budgetRange: value })} />
                <ChoiceGrid title="Available deposit" values={depositRangeOptions} selected={preferences.depositRange} onSelect={(value) => patch({ depositRange: value })} />
              </>
            ) : null}

            {step === 3 ? (
              <>
                <div>
                  <p className="text-sm font-medium text-zinc-200">Target states or regions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {AU_STATES.map((state) => (
                      <Choice key={state} selected={preferences.statesOfInterest.includes(state)} onClick={() => toggleState(state)}>
                        {state}
                      </Choice>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">Preferred property types</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {propertyTypeOptions.map((type) => (
                      <Choice key={type} selected={preferences.preferredPropertyTypes.includes(type)} onClick={() => togglePropertyType(type)}>
                        {labels[type]}
                      </Choice>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <ChoiceGrid title="Risk tolerance" values={riskToleranceOptions} selected={preferences.riskTolerance} onSelect={(value) => patch({ riskTolerance: value })} />
                <ChoiceGrid title="Existing portfolio" values={portfolioStatusOptions} selected={preferences.portfolioStatus} onSelect={(value) => patch({ portfolioStatus: value })} />
                <ChoiceGrid title="Context" values={buyerContextOptions} selected={preferences.buyerContext} onSelect={(value) => patch({ buyerContext: value })} />
                <ChoiceGrid title="Guidance level" values={guidanceLevelOptions} selected={preferences.guidanceLevel} onSelect={(value) => patch({ guidanceLevel: value })} />
              </>
            ) : null}
          </div>

          <div className="mt-8 rounded-xl border border-zinc-700/70 bg-zinc-950/45 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Personalisation preview</p>
            <p className="mt-2 text-sm text-zinc-300">{summary}</p>
          </div>

          {errorMessage ? <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-200" role="alert">{errorMessage}</p> : null}
          {saved ? <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200" aria-live="polite">Preferences saved.</p> : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            {step > 1 ? (
              <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60 sm:w-auto">
                Back
              </button>
            ) : null}
            <button type="button" onClick={handleContinue} disabled={saving} className="inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-[11rem]">
              {saving ? "Saving..." : step < totalSteps ? "Continue" : mode === "settings" ? "Save preferences" : "Finish"}
            </button>
            <button type="button" onClick={() => void persist(true)} disabled={saving} className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60 disabled:opacity-60 sm:w-auto">
              {mode === "settings" ? "Save as skipped" : "Skip for now"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
