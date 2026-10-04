"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type {
  MandatoryMetric,
  MetricProvenance,
  RankedResult,
  RankOutput,
  Strategy,
} from "@/lib/opportunity/types";
import type { InvestmentProfileInput } from "@/lib/opportunity/profileSchema";
import { useInvestmentPersistence, type SavedProfile } from "./useInvestmentPersistence";
import ChangeAlerts from "./ChangeAlerts";

type ApiOutput = RankOutput & { dataUnavailable: boolean; offeredStates: readonly string[] };

const STRATEGY_OPTIONS: { id: Strategy; label: string; blurb: string }[] = [
  { id: "growth", label: "Growth", blurb: "Favour long-term capital growth." },
  { id: "balanced", label: "Balanced", blurb: "Blend growth, demand and income." },
  { id: "yield", label: "Cash-flow", blurb: "Favour rental return and holding performance." },
];
const STATE_OPTIONS = ["SA", "VIC", "NSW", "QLD", "WA", "TAS", "ACT", "NT"] as const;
const OFFERED = new Set(["SA"]);

const aud = (n: number) => `A$${Math.round(n).toLocaleString("en-AU")}`;
const pct = (n: number) => `${n.toFixed(2)}%`;
const suburbCode = (geographyId: string) => geographyId.split("_")[1] ?? geographyId;
const METRIC_LABEL: Record<MandatoryMetric, string> = {
  median_house_price: "Median house price",
  median_rent: "Median rent",
  gross_yield: "Gross yield",
  sales_volume: "Sales volume (12m)",
  price_growth_12m: "12-month price growth",
};

function bandColour(band: string): string {
  if (band === "strong" || band === "high") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (band === "moderate" || band === "medium") return "bg-amber-100 text-amber-800 border-amber-300";
  if (band === "weak" || band === "low") return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

export default function FindInvestmentClient() {
  const { user, openEarlyAccessModal } = useAuth();
  const persistence = useInvestmentPersistence(!!user);

  const [step, setStep] = useState<"form" | "results">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<ApiOutput | null>(null);

  // Questionnaire state
  const [maxPrice, setMaxPrice] = useState(900_000);
  const [deposit, setDeposit] = useState(250_000);
  const [strategy, setStrategy] = useState<Strategy>("growth");
  const [acceptableWeeklyHoldingCost, setHolding] = useState(400);
  const [propertyType, setPropertyType] = useState<"house" | "unit">("house");
  const [states, setStates] = useState<string[]>(["SA"]);
  const [riskTolerance, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [holdingPeriodYears, setHold] = useState(10);

  const [compare, setCompare] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<RankedResult | null>(null);

  const currentInputs = useMemo<InvestmentProfileInput>(
    () => ({ maxPrice, deposit, strategy, acceptableWeeklyHoldingCost, propertyType, states: states as InvestmentProfileInput["states"], riskTolerance, holdingPeriodYears }),
    [maxPrice, deposit, strategy, acceptableWeeklyHoldingCost, propertyType, states, riskTolerance, holdingPeriodYears],
  );

  const applyInputs = useCallback((i: InvestmentProfileInput) => {
    setMaxPrice(i.maxPrice); setDeposit(i.deposit); setStrategy(i.strategy);
    setHolding(i.acceptableWeeklyHoldingCost); setPropertyType(i.propertyType);
    setStates(i.states); setRisk(i.riskTolerance); setHold(i.holdingPeriodYears);
  }, []);

  const toggleCompare = (id: string) => {
    setCompare((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Shortlist toggle goes through the RLS-protected API. Signed-out users are
  // sent to the existing login journey — we never pretend the item was saved.
  const onShortlist = useCallback(
    async (geographyId: string) => {
      if (!user) {
        openEarlyAccessModal();
        return;
      }
      if (persistence.shortlist.has(geographyId)) await persistence.removeShortlist(geographyId);
      else await persistence.addShortlist(geographyId);
    },
    [user, openEarlyAccessModal, persistence],
  );

  const submit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/investment/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(currentInputs),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setOutput((await res.json()) as ApiOutput);
      setStep("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [currentInputs]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Find My Investment</h1>
        <p className="mt-1 text-sm text-slate-600">
          Given your situation and strategy, where should you consider investing — and why. Descriptive,
          evidence-based scenarios from official open data. Not financial advice.
        </p>
      </header>

      {user && persistence.hydrated && persistence.shortlist.size > 0 && (
        <>
          <ChangeAlerts shortlistSize={persistence.shortlist.size} />
          <ShortlistPanel persistence={persistence} />
        </>
      )}

      {step === "form" ? (
        <Questionnaire
          {...{ maxPrice, setMaxPrice, deposit, setDeposit, strategy, setStrategy,
            acceptableWeeklyHoldingCost, setHolding, propertyType, setPropertyType,
            states, setStates, riskTolerance, setRisk, holdingPeriodYears, setHold,
            loading, error, submit }}
        />
      ) : (
        <>
          <SavedPanel
            signedIn={!!user}
            persistence={persistence}
            currentInputs={currentInputs}
            onLoadProfile={(p) => { applyInputs(p.inputs); }}
            onSignInRequired={openEarlyAccessModal}
          />
          <Results
            output={output}
            onBack={() => setStep("form")}
            shortlist={persistence.shortlist}
            compare={compare}
            onShortlist={onShortlist}
            onCompare={toggleCompare}
            onDetails={setDrawer}
          />
        </>
      )}

      {drawer && <EvidenceDrawer result={drawer} onClose={() => setDrawer(null)} />}
    </main>
  );
}

// ---------------------------------------------------------------------------

/** Persisted shortlist — visible on every step and after a hard refresh / new session. */
function ShortlistPanel({ persistence }: { persistence: ReturnType<typeof useInvestmentPersistence> }) {
  const geos = [...persistence.shortlist].sort();
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-semibold text-slate-800">Your saved shortlist ({geos.length})</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {geos.map((g) => (
          <li key={g} className="flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs">
            <a href={`/research/suburb/${suburbCode(g)}`} className="text-slate-700 underline">Suburb {suburbCode(g)}</a>
            <button
              aria-label={`Remove ${suburbCode(g)} from shortlist`}
              onClick={() => persistence.removeShortlist(g)}
              disabled={persistence.busy}
              className="text-slate-400 hover:text-red-600 disabled:opacity-50"
            >✕</button>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-500">Saved to your account — persists across refresh and devices. Re-run a search to compare shortlisted suburbs.</p>
    </div>
  );
}

/** Saved profiles + save/load/update/delete, all server-backed (RLS). */
function SavedPanel(props: {
  signedIn: boolean;
  persistence: ReturnType<typeof useInvestmentPersistence>;
  currentInputs: InvestmentProfileInput;
  onLoadProfile: (p: SavedProfile) => void;
  onSignInRequired: () => void;
}) {
  const { persistence } = props;
  const [name, setName] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  async function handleSave() {
    if (!props.signedIn) { props.onSignInRequired(); return; }
    const id = await persistence.saveProfile(name.trim() || "My investment profile", props.currentInputs);
    if (id) { setSavedId(id); setName(""); }
  }

  if (!props.signedIn) {
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        <button onClick={props.onSignInRequired} className="font-medium text-slate-800 underline">Sign in</button>
        <span className="text-slate-600"> to save this search and build a shortlist that persists across devices.</span>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Profile name"
          value={name}
          onChange={(e) => { setName(e.target.value); setSavedId(null); }}
          placeholder="Name this search"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button onClick={handleSave} disabled={persistence.busy} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {persistence.busy ? "Saving…" : "Save profile"}
        </button>
        {savedId && <span className="text-xs font-medium text-emerald-700">✓ Saved</span>}
        {persistence.error && <span role="alert" className="text-xs text-red-600">{persistence.error}</span>}
      </div>
      {persistence.profiles.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {persistence.profiles.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-1.5">
              <span className="text-slate-700">{p.name}</span>
              <span className="flex gap-2">
                <button onClick={() => props.onLoadProfile(p)} className="text-xs text-slate-600 underline">Load</button>
                <button onClick={() => persistence.updateProfile(p.id, p.name, props.currentInputs)} className="text-xs text-slate-600 underline">Update to current</button>
                <button onClick={() => persistence.deleteProfile(p.id)} className="text-xs text-red-600 underline">Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Questionnaire(p: {
  maxPrice: number; setMaxPrice: (n: number) => void;
  deposit: number; setDeposit: (n: number) => void;
  strategy: Strategy; setStrategy: (s: Strategy) => void;
  acceptableWeeklyHoldingCost: number; setHolding: (n: number) => void;
  propertyType: "house" | "unit"; setPropertyType: (t: "house" | "unit") => void;
  states: string[]; setStates: (s: string[]) => void;
  riskTolerance: "low" | "medium" | "high"; setRisk: (r: "low" | "medium" | "high") => void;
  holdingPeriodYears: number; setHold: (n: number) => void;
  loading: boolean; error: string | null; submit: () => void;
}) {
  const toggleState = (s: string) =>
    p.setStates(p.states.includes(s) ? p.states.filter((x) => x !== s) : [...p.states, s]);

  return (
    <form
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={(e) => { e.preventDefault(); p.submit(); }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Maximum purchase price" value={p.maxPrice} onChange={p.setMaxPrice} min={100_000} step={25_000} prefix="A$" />
        <NumberField label="Available deposit" value={p.deposit} onChange={p.setDeposit} min={0} step={10_000} prefix="A$" />
        <NumberField label="Acceptable weekly holding cost" value={p.acceptableWeeklyHoldingCost} onChange={p.setHolding} min={0} step={25} prefix="A$/wk" hint="Max you'll cover out-of-pocket each week." />
        <NumberField label="Intended holding period (years)" value={p.holdingPeriodYears} onChange={p.setHold} min={1} max={40} step={1} />
      </div>

      <RadioGroup
        legend="Strategy"
        value={p.strategy}
        onChange={(v) => p.setStrategy(v as Strategy)}
        options={STRATEGY_OPTIONS.map((o) => ({ value: o.id, label: o.label, hint: o.blurb }))}
      />

      <RadioGroup
        legend="Property type"
        value={p.propertyType}
        onChange={(v) => p.setPropertyType(v as "house" | "unit")}
        options={[{ value: "house", label: "House" }, { value: "unit", label: "Unit" }]}
      />

      <RadioGroup
        legend="Risk tolerance"
        value={p.riskTolerance}
        onChange={(v) => p.setRisk(v as "low" | "medium" | "high")}
        options={[{ value: "low", label: "Lower" }, { value: "medium", label: "Balanced" }, { value: "high", label: "Higher" }]}
      />

      <fieldset>
        <legend className="text-sm font-medium text-slate-800">States to include or exclude</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATE_OPTIONS.map((s) => {
            const active = p.states.includes(s);
            const offered = OFFERED.has(s);
            return (
              <button
                type="button"
                key={s}
                aria-pressed={active}
                onClick={() => toggleState(s)}
                className={`rounded-full border px-3 py-1 text-sm transition ${active ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}
              >
                {s}
                {!offered && <span className="ml-1 text-[10px] uppercase opacity-70">soon</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-500">Only SA is ranked today. Other states are honestly blocked until their coverage gate is met.</p>
      </fieldset>

      {p.error && <p role="alert" className="text-sm text-red-600">{p.error}</p>}

      <button
        type="submit"
        disabled={p.loading}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
      >
        {p.loading ? "Finding investments…" : "Find my investment"}
      </button>
    </form>
  );
}

function NumberField(props: {
  label: string; value: number; onChange: (n: number) => void;
  min?: number; max?: number; step?: number; prefix?: string; hint?: string;
}) {
  const id = useMemo(() => `f-${props.label.replace(/\W+/g, "-").toLowerCase()}`, [props.label]);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{props.label}</label>
      <div className="mt-1 flex items-center rounded-lg border border-slate-300 focus-within:border-slate-500">
        {props.prefix && <span className="pl-3 text-sm text-slate-500">{props.prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="numeric"
          className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none"
          value={props.value}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={(e) => props.onChange(Number(e.target.value))}
        />
      </div>
      {props.hint && <p className="mt-1 text-xs text-slate-500">{props.hint}</p>}
    </div>
  );
}

function RadioGroup(props: {
  legend: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-800">{props.legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {props.options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm ${props.value === o.value ? "border-slate-800 ring-1 ring-slate-800" : "border-slate-300 hover:border-slate-400"}`}
          >
            <span className="flex items-center gap-2 font-medium text-slate-800">
              <input
                type="radio"
                name={props.legend}
                value={o.value}
                checked={props.value === o.value}
                onChange={() => props.onChange(o.value)}
                className="h-4 w-4"
              />
              {o.label}
            </span>
            {o.hint && <span className="mt-0.5 pl-6 text-xs text-slate-500">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------

function Results(props: {
  output: ApiOutput | null;
  onBack: () => void;
  shortlist: Set<string>;
  compare: Set<string>;
  onShortlist: (id: string) => void;
  onCompare: (id: string) => void;
  onDetails: (r: RankedResult) => void;
}) {
  const { output } = props;
  const ranked = output?.ranked ?? [];
  const compared = ranked.filter((r) => props.compare.has(r.geographyId));

  return (
    <section aria-live="polite">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={props.onBack} className="text-sm text-slate-600 underline">← Adjust your profile</button>
        {output && <span className="text-xs text-slate-500">Scored with {output.scoreVersion} · {new Date(output.asOf).toLocaleDateString("en-AU")}</span>}
      </div>

      {!output ? null : output.stateBlocked ? (
        <EmptyState
          title="Ranking isn't available for those states yet"
          body={`We only rank ${[...output.offeredStates].join(", ")} today. Other states are honestly blocked until their official-data coverage gate is met — we won't invent numbers.`}
        />
      ) : output.dataUnavailable && ranked.length === 0 ? (
        <EmptyState
          title="Coverage not yet available"
          body="The investment dataset isn't enabled in this environment yet (migration 059 awaits validation approval). No synthetic results are shown."
        />
      ) : ranked.length === 0 ? (
        <EmptyState
          title="No suburbs matched your profile"
          body="Every candidate was set aside for a concrete reason (below). Try raising your price or holding-cost limits."
          excluded={output.excluded}
        />
      ) : (
        <>
          {compared.length >= 2 && <CompareTable results={compared} />}
          <ol className="space-y-3">
            {ranked.map((r, i) => (
              <ResultCard
                key={r.geographyId}
                rank={i + 1}
                r={r}
                shortlisted={props.shortlist.has(r.geographyId)}
                comparing={props.compare.has(r.geographyId)}
                onShortlist={() => props.onShortlist(r.geographyId)}
                onCompare={() => props.onCompare(r.geographyId)}
                onDetails={() => props.onDetails(r)}
              />
            ))}
          </ol>
          {output.excluded.length > 0 && <ExcludedSummary excluded={output.excluded} />}
        </>
      )}
    </section>
  );
}

function ResultCard(props: {
  rank: number; r: RankedResult;
  shortlisted: boolean; comparing: boolean;
  onShortlist: () => void; onCompare: () => void; onDetails: () => void;
}) {
  const { r } = props;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">#{props.rank}</span>
            <h3 className="text-base font-semibold text-slate-900">{r.suburbName ?? `Suburb ${suburbCode(r.geographyId)}`} <span className="text-slate-400">({r.jurisdiction})</span></h3>
            {r.stale && <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">aging data</span>}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{aud(r.evidence.median_house_price.value)} median · {aud(r.evidence.median_rent.value)}/wk rent · {pct(r.evidence.gross_yield.value)} yield</p>
        </div>
        <div className="flex items-center gap-2">
          <ScorePill label="Opportunity" value={r.opportunityScore} band={r.opportunityBand} />
          <ScorePill label="Confidence" value={r.confidence} band={r.confidenceBand} />
          <ScorePill label="Fit" value={r.affordabilityFit} band={r.affordabilityFit >= 60 ? "strong" : r.affordabilityFit >= 30 ? "moderate" : "weak"} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ul className="space-y-1">
          {r.reasonsFor.slice(0, 2).map((x, i) => (
            <li key={i} className="flex gap-1.5 text-sm text-slate-700"><span className="text-emerald-600">▲</span>{x}</li>
          ))}
        </ul>
        <ul className="space-y-1">
          {r.reasonsAgainst.slice(0, 2).map((x, i) => (
            <li key={i} className="flex gap-1.5 text-sm text-slate-700"><span className="text-orange-500">▼</span>{x}</li>
          ))}
        </ul>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Scenario (not advice): {r.scenario.weeklyPreTaxCashflow >= 0 ? "+" : ""}{aud(r.scenario.weeklyPreTaxCashflow)}/wk before tax · LVR {r.scenario.lvr.toFixed(0)}%
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={props.onDetails} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-slate-500">Details &amp; evidence</button>
        <button onClick={props.onShortlist} aria-pressed={props.shortlisted} className={`rounded-lg border px-3 py-1.5 text-sm ${props.shortlisted ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 hover:border-slate-500"}`}>
          {props.shortlisted ? "Shortlisted ✓" : "Save to shortlist"}
        </button>
        <button onClick={props.onCompare} aria-pressed={props.comparing} className={`rounded-lg border px-3 py-1.5 text-sm ${props.comparing ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 hover:border-slate-500"}`}>
          {props.comparing ? "Comparing ✓" : "Compare"}
        </button>
        <a href={`/research/suburb/${suburbCode(r.geographyId)}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-slate-500">Open research profile →</a>
      </div>
    </li>
  );
}

function ScorePill({ label, value, band }: { label: string; value: number; band: string }) {
  return (
    <div className={`rounded-lg border px-2.5 py-1 text-center ${bandColour(band)}`} title={`${label}: ${value}/100 (${band})`}>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-lg font-bold leading-none">{value}</div>
    </div>
  );
}

function EmptyState({ title, body, excluded }: { title: string; body: string; excluded?: RankOutput["excluded"] }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{body}</p>
      {excluded && excluded.length > 0 && <ExcludedSummary excluded={excluded} />}
    </div>
  );
}

function ExcludedSummary({ excluded }: { excluded: RankOutput["excluded"] }) {
  const byReason = excluded.reduce<Record<string, number>>((acc, e) => {
    acc[e.reason] = (acc[e.reason] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-left">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">{excluded.length} suburbs set aside — why</summary>
      <ul className="mt-2 space-y-1 text-sm text-slate-600">
        {Object.entries(byReason).map(([reason, n]) => (
          <li key={reason}>• {n} × {reason.replace(/_/g, " ")}</li>
        ))}
      </ul>
    </details>
  );
}

function CompareTable({ results }: { results: RankedResult[] }) {
  const metrics: MandatoryMetric[] = ["median_house_price", "median_rent", "gross_yield", "sales_volume", "price_growth_12m"];
  return (
    <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold text-slate-800">Compare ({results.length})</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 pr-3">Metric</th>
            {results.map((r) => <th key={r.geographyId} className="py-1 pr-3">{r.suburbName ?? suburbCode(r.geographyId)}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr><td className="py-1 pr-3 text-slate-500">Opportunity</td>{results.map((r) => <td key={r.geographyId} className="py-1 pr-3 font-medium">{r.opportunityScore}</td>)}</tr>
          <tr><td className="py-1 pr-3 text-slate-500">Confidence</td>{results.map((r) => <td key={r.geographyId} className="py-1 pr-3">{r.confidence}</td>)}</tr>
          {metrics.map((m) => (
            <tr key={m}><td className="py-1 pr-3 text-slate-500">{METRIC_LABEL[m]}</td>
              {results.map((r) => <td key={r.geographyId} className="py-1 pr-3">{formatMetric(m, r.evidence[m])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMetric(m: MandatoryMetric, p: MetricProvenance): string {
  if (m === "median_house_price") return aud(p.value);
  if (m === "median_rent") return `${aud(p.value)}/wk`;
  if (m === "sales_volume") return `${p.value}`;
  return pct(p.value);
}

// ---------------------------------------------------------------------------

function EvidenceDrawer({ result: r, onClose }: { result: RankedResult; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const metrics: MandatoryMetric[] = ["median_house_price", "median_rent", "gross_yield", "sales_volume", "price_growth_12m"];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true" aria-label="Evidence and calculations" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{r.suburbName ?? `Suburb ${suburbCode(r.geographyId)}`} <span className="text-slate-400">({r.jurisdiction})</span></h2>
          <button ref={closeRef} onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
        </div>

        <section className="mt-4">
          <h3 className="text-sm font-semibold text-slate-800">Score breakdown ({r.scoreVersion})</h3>
          <p className="mt-1 text-xs text-slate-500">Weights ({r.strategy}): growth {r.weights.growth} · demand {r.weights.demand} · yield {r.weights.yield}</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li>Growth index: <b>{r.subIndices.growth}</b> × {r.weights.growth}%</li>
            <li>Demand index: <b>{r.subIndices.demand}</b> × {r.weights.demand}%</li>
            <li>Yield index: <b>{r.subIndices.yield}</b> × {r.weights.yield}%</li>
            <li className="pt-1 font-medium">= Opportunity {r.opportunityScore}/100 · Confidence {r.confidence}/100 · Fit {r.affordabilityFit}/100</li>
          </ul>
        </section>

        <section className="mt-5">
          <h3 className="text-sm font-semibold text-slate-800">Evidence &amp; provenance</h3>
          <ul className="mt-2 space-y-2">
            {metrics.map((m) => {
              const p = r.evidence[m];
              return (
                <li key={m} className="rounded-lg border border-slate-200 p-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">{METRIC_LABEL[m]}</span><span className="font-medium">{formatMetric(m, p)} <span className="text-xs text-slate-400">({p.status})</span></span></div>
                  <div className="mt-0.5 text-xs text-slate-500">Source: {p.source_id} · period {p.period_start ?? "?"} → {p.period_end ?? "?"} · retrieved {p.retrieved_at ? new Date(p.retrieved_at).toLocaleDateString("en-AU") : "?"}</div>
                  {p.attribution && <div className="text-xs text-slate-400">{p.attribution}</div>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-5">
          <h3 className="text-sm font-semibold text-slate-800">Cash-flow scenario (not advice)</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li>Gross yield: {pct(r.scenario.grossYieldPct)}</li>
            <li>Weekly (before tax): {aud(r.scenario.weeklyPreTaxCashflow)}</li>
            <li>Weekly (after tax): {aud(r.scenario.weeklyAfterTaxCashflow)}</li>
            <li>LVR: {r.scenario.lvr.toFixed(1)}% · Cash required: {aud(r.scenario.totalCashRequired)}</li>
          </ul>
          <p className="mt-2 text-xs text-slate-500">Assumptions: {Object.entries(r.scenario.assumptions).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ")}. Price and rent are official warehouse values; all else is a labelled assumption.</p>
        </section>

        {(r.reasonsFor.length > 0 || r.reasonsAgainst.length > 0) && (
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-800">Why</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {r.reasonsFor.map((x, i) => <li key={`f${i}`} className="text-slate-700">▲ {x}</li>)}
              {r.reasonsAgainst.map((x, i) => <li key={`a${i}`} className="text-slate-700">▼ {x}</li>)}
            </ul>
          </section>
        )}

        {r.missingEvidence.length > 0 && (
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-800">Missing / aging evidence</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {r.missingEvidence.map((x, i) => <li key={i}>• {x}</li>)}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
