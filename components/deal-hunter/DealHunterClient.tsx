"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BuyBoxRequiredCard } from "@/components/founding-beta/BuyBoxRequiredCard";
import { trackEvent, type FoundingBetaPipelineStatus } from "@/lib/analytics/events";
import type { DealResult } from "@/lib/dealhunter/types";
import { buildDealBrief } from "@/lib/dealhunter/dealbrief";

interface Feed {
  dataSource: string;
  dataSourceLabel: string;
  scoreVersion: string;
  buyBox: {
    version: string;
    hardGates: { maxPurchasePrice: number; depositAvailable: number; eligibleStates: string[]; propertyTypes: string[]; maxWeeklyHoldingCost: number };
    softPreferences: { growthVsYield: number; riskTolerance: string; dataConfidenceRequirement: string };
    explanations: { input: string; answer: string; effect: string }[];
  };
  ranked: DealResult[];
  needsReview: DealResult[];
  ineligible: DealResult[];
  needsProfile?: boolean;
}

const money = (n: number | null | undefined) => (n == null ? "—" : `A$${Math.round(n).toLocaleString("en-AU")}`);
const bandColour = (b: string) =>
  b === "strong" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : b === "moderate" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-orange-100 text-orange-800 border-orange-300";
const REASONS = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "poor_cashflow", label: "Poor cash-flow" },
  { id: "wrong_location", label: "Wrong location" },
  { id: "too_small", label: "Too small" },
  { id: "condition_or_risk", label: "Condition / risk" },
  { id: "low_confidence", label: "Low confidence" },
  { id: "other", label: "Other" },
];

export default function DealHunterClient() {
  const { user, openEarlyAccessModal } = useAuth();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"ranked" | "review" | "ineligible">("ranked");
  const [onlyHighConfidence, setOnlyHighConfidence] = useState(false);
  const [selected, setSelected] = useState<DealResult | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [pipeline, setPipeline] = useState<Record<string, string>>({});
  const [proposals, setProposals] = useState<{ field: string; from: string | number; to: string | number; rationale: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dealhunter/deals");
      if (res.status === 401) { setError("Please sign in to hunt deals."); return; }
      if (res.status === 404) { setError("Deal Hunter isn’t available in this environment."); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFeed((await res.json()) as Feed);
      const [pRes, fRes] = await Promise.all([fetch("/api/dealhunter/pipeline"), fetch("/api/dealhunter/feedback")]);
      if (pRes.ok) {
        const body = (await pRes.json()) as { items: { listing_key: string; status: string }[] };
        setPipeline(Object.fromEntries(body.items.map((i) => [i.listing_key, i.status])));
      }
      if (fRes.ok) setProposals((await fRes.json()).proposals ?? []);
    } catch {
      setError("Couldn’t load your deals just now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
    else setLoading(false);
  }, [user, load]);

  const setStatus = useCallback(async (key: string, status: FoundingBetaPipelineStatus, reason?: string) => {
    setPipeline((p) => ({ ...p, [key]: status }));
    const pipelineResponse = await fetch("/api/dealhunter/pipeline", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listing_key: key, status, ...(reason ? { rejection_reason: reason } : {}) }),
    });
    if (pipelineResponse.ok) {
      trackEvent({ name: "founding_beta_pipeline_updated", surface: "deal_hunter", status });
    }
    const kind = status === "rejected" ? "rejected" : status === "reviewing" ? "saved" : "saved";
    await fetch("/api/dealhunter/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listing_key: key, kind, ...(reason ? { reason } : {}) }) });
  }, []);

  const toggleCompare = (key: string) =>
    setCompare((c) => (c.includes(key) ? c.filter((k) => k !== key) : c.length >= 3 ? c : [...c, key]));

  const visible = useMemo(() => {
    const bucket = feed ? (tab === "ranked" ? feed.ranked : tab === "review" ? feed.needsReview : feed.ineligible) : [];
    return onlyHighConfidence ? bucket.filter((d) => d.confidence >= 0.8) : bucket;
  }, [feed, tab, onlyHighConfidence]);

  if (!user) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">Deal Hunter <span className="align-middle text-xs font-medium text-slate-500">ALPHA</span></h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to turn your saved investment profile into a personal buy box and match it to opportunities.</p>
        <button onClick={openEarlyAccessModal} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Sign in</button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Deal Hunter <span className="align-middle text-xs font-medium text-slate-500">ALPHA</span></h1>
        <p className="mt-1 text-sm text-slate-600">Your buy box, matched to opportunities, with a decision-grade deal brief. Evidence and scenarios — not financial advice.</p>
      </header>

      {feed?.dataSource === "replay" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>Replay data.</strong> Listings shown are a labelled synthetic dataset for the alpha — not live market listings. Market metrics are real official open data.
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading your deals…</p>}
      {error && <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">{error}</p>}
      {feed?.needsProfile && (
        <BuyBoxRequiredCard surface="deal_hunter" />
      )}

      {feed && !feed.needsProfile && (
        <>
          <BuyBoxSummary buyBox={feed.buyBox} />

          {proposals.length > 0 && (
            <section className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
              <h2 className="text-sm font-semibold text-sky-900">Suggested tweaks to your buy box</h2>
              <ul className="mt-1 space-y-1 text-xs text-sky-900">
                {proposals.map((p, i) => (
                  <li key={i}>• {p.rationale} <span className="text-sky-700">({String(p.field)}: {String(p.from)} → {String(p.to)})</span></li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-sky-700">Proposals only — nothing changes until you edit your profile. We never silently re-rank.</p>
            </section>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["ranked", "review", "ineligible"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === t ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                {t === "ranked" ? "Matches" : t === "review" ? "Needs review" : "Excluded"} ({feed[t === "ranked" ? "ranked" : t === "review" ? "needsReview" : "ineligible"].length})
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={onlyHighConfidence} onChange={(e) => setOnlyHighConfidence(e.target.checked)} /> High confidence only
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-slate-500">No listings in this view.</p>
          ) : (
            <ul className="space-y-3">
              {visible.map((d) => (
                <DealCard key={d.key} deal={d} status={pipeline[d.key]} inCompare={compare.includes(d.key)}
                  onDetails={() => { setSelected(d); trackEvent({ name: "founding_beta_deal_brief_opened", surface: "deal_hunter" }); }} onCompare={() => toggleCompare(d.key)}
                  onSave={() => setStatus(d.key, "reviewing")} onDueDiligence={() => setStatus(d.key, "due_diligence")}
                  onPass={(reason) => setStatus(d.key, "rejected", reason)} />
              ))}
            </ul>
          )}

          {compare.length > 0 && (
            // Sit above the mobile bottom tab-nav (fixed bottom-0, z-40) so the Compare action is
            // reachable on mobile; on desktop (lg) there is no bottom nav, so anchor to bottom-0.
            <div className="fixed inset-x-0 bottom-20 z-40 border-t border-slate-200 bg-white p-3 lg:bottom-0 lg:z-30">
              <div className="mx-auto flex max-w-5xl items-center justify-between">
                <span className="text-xs text-slate-600">{compare.length} selected to compare (max 3)</span>
                <div className="flex gap-2">
                  <button onClick={() => setCompare([])} className="text-xs text-slate-500 underline">Clear</button>
                  <button onClick={() => { setShowCompare(true); trackEvent({ name: "founding_beta_compare_opened", surface: "deal_hunter", selectionCount: compare.length }); }} disabled={compare.length < 2}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Compare</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {selected && <DealDrawer deal={selected} onClose={() => setSelected(null)} />}
      {showCompare && feed && (
        <CompareView deals={[...feed.ranked, ...feed.needsReview, ...feed.ineligible].filter((d) => compare.includes(d.key))} onClose={() => setShowCompare(false)} />
      )}
    </main>
  );
}

function BuyBoxSummary({ buyBox }: { buyBox: Feed["buyBox"] }) {
  const [open, setOpen] = useState(false);
  const g = buyBox.hardGates;
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Your buy box</h2>
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-slate-500 underline">{open ? "Hide" : "How was this built?"}</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <Chip>≤ {money(g.maxPurchasePrice)}</Chip>
        <Chip>Deposit {money(g.depositAvailable)}</Chip>
        <Chip>{g.propertyTypes.join(", ")}</Chip>
        <Chip>{g.eligibleStates.join(", ") || "no eligible state"}</Chip>
        <Chip>≤ {money(g.maxWeeklyHoldingCost)}/wk out-of-pocket</Chip>
        <Chip>{buyBox.softPreferences.growthVsYield > 0 ? "Growth-weighted" : buyBox.softPreferences.growthVsYield < 0 ? "Yield-weighted" : "Balanced"}</Chip>
      </div>
      {open && (
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
          {buyBox.explanations.map((e, i) => (
            <li key={i}><span className="font-medium text-slate-800">{e.input}:</span> {e.answer} — <span className="text-slate-500">{e.effect}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-slate-700">{children}</span>;
}

function DealCard(props: {
  deal: DealResult; status?: string; inCompare: boolean;
  onDetails: () => void; onCompare: () => void; onSave: () => void; onDueDiligence: () => void; onPass: (reason: string) => void;
}) {
  const { deal: d } = props;
  const [passing, setPassing] = useState(false);
  const price = d.priceUndisclosed ? (d.listing.priceText ?? "Price on application") : money((d.listing.priceLowerBound ?? 0) || d.listing.priceUpperBound);
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${bandColour(d.dealBand)}`}>Deal {d.dealScore}</span>
            <h3 className="truncate text-sm font-semibold text-slate-900">{d.listing.address.suburb ?? "SA"} · {d.listing.propertyType ?? "property"}</h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-600">{price} · {d.listing.bedrooms ?? "?"}🛏 {d.listing.bathrooms ?? "?"}🛁 · confidence {Math.round(d.confidence * 100)}%</p>
          <p className="mt-1 text-xs text-slate-700">{d.explanation.whyMatches[0] ?? d.explanation.whyMayNot[0] ?? "Evidence-based match."}</p>
          {!d.eligible && <p className="mt-1 text-xs text-orange-700">Excluded: {d.hardGateFailures.map((f) => f.detail).join(" ")}</p>}
        </div>
        <div className="shrink-0 text-right text-xs">
          {props.status && <span className="mb-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{props.status.replace("_", " ")}</span>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <button onClick={props.onDetails} className="rounded-lg border border-slate-300 px-2.5 py-1 text-slate-700">Details & brief</button>
        {d.eligible && <button onClick={props.onSave} className="rounded-lg border border-slate-300 px-2.5 py-1 text-slate-700">Save to review</button>}
        {d.eligible && <button onClick={props.onDueDiligence} className="rounded-lg border border-slate-300 px-2.5 py-1 text-slate-700">Due diligence</button>}
        <button onClick={() => setPassing((v) => !v)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-slate-700">Pass…</button>
        <button onClick={props.onCompare} className={`rounded-lg border px-2.5 py-1 ${props.inCompare ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-700"}`}>{props.inCompare ? "Comparing" : "Compare"}</button>
      </div>
      {passing && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
          <span className="mr-1 text-xs text-slate-500">Reason (required):</span>
          {REASONS.map((r) => (
            <button key={r.id} onClick={() => { props.onPass(r.id); setPassing(false); }} className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50">{r.label}</button>
          ))}
        </div>
      )}
    </li>
  );
}

function originBadge(origin: string) {
  const map: Record<string, string> = {
    listing_fact: "bg-slate-100 text-slate-700",
    market_evidence: "bg-emerald-50 text-emerald-700",
    propellect_estimate: "bg-sky-50 text-sky-700",
    user_assumption: "bg-violet-50 text-violet-700",
    missing: "bg-amber-50 text-amber-700",
  };
  const label: Record<string, string> = {
    listing_fact: "listing fact", market_evidence: "market evidence", propellect_estimate: "estimate", user_assumption: "your input", missing: "missing",
  };
  return <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${map[origin] ?? "bg-slate-100"}`}>{label[origin] ?? origin}</span>;
}

function DealDrawer({ deal, onClose }: { deal: DealResult; onClose: () => void }) {
  const brief = useMemo(() => buildDealBrief(deal, new Date().toISOString()), [deal]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Deal brief">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{brief.headline.suburb} · {brief.headline.propertyType}</h2>
            <p className="text-xs text-slate-600">{brief.headline.address}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <p className="mt-2 text-sm text-slate-800">Deal score <strong>{brief.fit.dealScore}</strong> ({brief.fit.dealBand}) · confidence {brief.fit.confidencePct}% · score {deal.scoreVersion}</p>

        <Section title="Why it fits">{list(brief.whyMatches)}</Section>
        <Section title="Why it may not">{list(brief.whyMayNot)}</Section>
        <Section title="Financials (modelled)">
          <ul className="text-xs text-slate-700">{brief.financials.map((f, i) => <li key={i} className="flex justify-between border-b border-slate-50 py-1"><span>{f.label}{originBadge(f.origin)}</span><span className="font-medium">{f.value}</span></li>)}</ul>
        </Section>
        <Section title="Market evidence">
          <ul className="text-xs text-slate-700">{brief.marketEvidence.map((f, i) => <li key={i} className="flex justify-between border-b border-slate-50 py-1"><span>{f.label}{originBadge(f.origin)}</span><span className="font-medium">{f.value}{f.source ? ` · ${f.source}` : ""}</span></li>)}</ul>
        </Section>
        <Section title="What could kill the deal">{list(brief.couldKillDeal)}</Section>
        <Section title="What to verify next">{list(brief.verifyNext)}</Section>
        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">{brief.disclaimer}</p>
      </div>
    </div>
  );
}

function CompareView({ deals, onClose }: { deals: DealResult[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Compare deals">
        <div className="flex justify-between"><h2 className="text-base font-semibold text-slate-900">Compare</h2><button onClick={onClose} aria-label="Close">✕</button></div>
        <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: `repeat(${deals.length}, minmax(0,1fr))` }}>
          {deals.map((d) => (
            <div key={d.key} className="rounded-lg border border-slate-200 p-2 text-xs">
              <p className="font-semibold text-slate-900">{d.listing.address.suburb}</p>
              <p className="text-slate-600">{money((d.listing.priceLowerBound ?? 0) || d.listing.priceUpperBound)}</p>
              <p>Deal score: <strong>{d.dealScore}</strong> ({d.dealBand})</p>
              <p>Confidence: {Math.round(d.confidence * 100)}%</p>
              <p>Yield: {d.estimate ? `${d.estimate.grossYieldPct.toFixed(2)}%` : "—"}</p>
              <p>Weekly cash-flow: {d.estimate ? money(d.estimate.weeklyPreTaxCashflow) : "—"}</p>
              <p>Eligible: {d.eligible ? "yes" : "no"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}
function list(items: string[]) {
  return items.length ? <ul className="list-disc pl-4 text-xs text-slate-700">{items.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="text-xs text-slate-400">—</p>;
}
