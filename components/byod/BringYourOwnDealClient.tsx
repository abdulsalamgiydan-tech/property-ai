"use client";

import { useState, type FormEvent } from "react";
import type { DealBrief, DealBriefFigure } from "@/lib/dealhunter/dealbrief";
import type { DealResult } from "@/lib/dealhunter/types";
import type { Completeness } from "@/lib/byod/schema";
import { BuyBoxRequiredCard } from "@/components/founding-beta/BuyBoxRequiredCard";
import { trackEvent, type FoundingBetaPipelineStatus } from "@/lib/analytics/events";

/**
 * V8 Bring Your Own Deal (invite-only). The customer pastes a listing URL FOR
 * REFERENCE ONLY and manually enters the facts — we never read the page. The same
 * tested V7 engine scores it; evidence classes (your facts / official evidence /
 * Propellect estimate) are clearly labelled throughout.
 */

const SA_SUBURBS = [
  { name: "Grange", geo: "SAL_40530", postcode: "5022" },
  { name: "Belair", geo: "SAL_40089", postcode: "5052" },
  { name: "Seaton", geo: "SAL_41010", postcode: "5023" },
  { name: "Unley", geo: "SAL_41190", postcode: "5061" },
] as const;

type Analysis = {
  deal: DealResult;
  brief: DealBrief;
  bucket: "ranked" | "needs_review" | "ineligible";
  submissionId: string;
  listingKey: string;
  completeness: Completeness;
};
type AnalyzeResponse = Analysis | { needsConfirmation: true; completeness: Completeness } | { needsProfile: true } | { error: string };

const ORIGIN_LABEL: Record<DealBriefFigure["origin"], { label: string; cls: string }> = {
  listing_fact: { label: "Your fact", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  market_evidence: { label: "Official evidence", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  user_assumption: { label: "Assumption", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  propellect_estimate: { label: "Propellect estimate", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  missing: { label: "Missing", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};
function OriginBadge({ origin }: { origin: DealBriefFigure["origin"] }) {
  const o = ORIGIN_LABEL[origin];
  return <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] ${o.cls}`}>{o.label}</span>;
}
function FigureRow({ f }: { f: DealBriefFigure }) {
  return (
    <li className="flex items-start justify-between gap-2 border-b border-slate-50 py-1 text-xs">
      <span className="text-slate-700">{f.label}<OriginBadge origin={f.origin} />{f.source ? <span className="ml-1 text-slate-400">· {f.source}</span> : null}</span>
      <span className="shrink-0 font-medium text-slate-900">{f.value}</span>
    </li>
  );
}

type FormState = {
  sourceUrl: string; suburbIdx: number; addressFull: string; propertyType: string;
  bedrooms: string; bathrooms: string; parking: string; landAreaSqm: string;
  priceDisplay: string; price: string; priceUpper: string; listingStatus: string;
};
const EMPTY: FormState = {
  sourceUrl: "", suburbIdx: 0, addressFull: "", propertyType: "house",
  bedrooms: "", bathrooms: "", parking: "", landAreaSqm: "",
  priceDisplay: "exact", price: "", priceUpper: "", listingStatus: "for_sale",
};
const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));

export default function BringYourOwnDealClient() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<Completeness | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const [compare, setCompare] = useState<Analysis[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const set = (k: keyof FormState, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  function buildListing() {
    const sub = SA_SUBURBS[form.suburbIdx];
    return {
      sourceUrl: form.sourceUrl.trim() || null,
      address: { full: form.addressFull.trim(), suburb: sub.name, state: "SA", postcode: sub.postcode },
      geographyId: sub.geo,
      propertyType: form.propertyType,
      bedrooms: num(form.bedrooms), bathrooms: num(form.bathrooms), parking: num(form.parking),
      landAreaSqm: num(form.landAreaSqm),
      priceDisplay: form.priceDisplay,
      price: num(form.price), priceUpper: num(form.priceUpper),
      listingStatus: form.listingStatus,
    };
  }

  async function analyze(confirmIncomplete: boolean) {
    setBusy(true); setError(null); setNeedsProfile(false); setPendingConfirm(null);
    try {
      const res = await fetch("/api/byod/analyze", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing: buildListing(), confirmIncomplete }),
      });
      const body = (await res.json()) as AnalyzeResponse;
      if (!res.ok) { setError((body as { error?: string }).error ?? "Analysis failed."); return; }
      if ("needsProfile" in body) { setNeedsProfile(true); return; }
      if ("needsConfirmation" in body) {
        setPendingConfirm(body.completeness);
        trackEvent({ name: "founding_beta_missing_facts_prompted", surface: "byod", missingCount: body.completeness.missing.length });
        return;
      }
      const completed = body as Analysis;
      setAnalysis(completed); setSaved(null);
      trackEvent({
        name: "founding_beta_analysis_completed",
        surface: "byod",
        bucket: completed.bucket,
        completeFacts: completed.completeness.complete,
        missingCount: completed.completeness.missing.length,
      });
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    trackEvent({ name: "founding_beta_analysis_started", surface: "byod" });
    await analyze(false);
  }

  async function pipeline(status: FoundingBetaPipelineStatus, reason?: string) {
    if (!analysis) return;
    setBusy(true); setError(null);
    try {
      // Persist the user-entered submission (reference-only URL + facts), then pipeline it.
      await fetch("/api/byod/submissions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing: buildListing() }),
      });
      const res = await fetch("/api/dealhunter/pipeline", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing_key: analysis.listingKey, status, rejection_reason: reason }),
      });
      if (res.ok) {
        setSaved(status);
        trackEvent({ name: "founding_beta_pipeline_updated", surface: "byod", status });
      }
      else setError("Could not update your pipeline.");
    } finally { setBusy(false); }
  }

  const d = analysis?.deal;
  const b = analysis?.brief;

  return (
    <main className="mx-auto max-w-3xl p-4 pb-28">
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Bring Your Own Deal</h1>
          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">Founding beta</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">Found a property elsewhere? Paste its link for reference and enter the facts — we score it against your buy box with official market evidence. We never read the listing page for you.</p>
      </header>

      {!analysis && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Listing URL <span className="font-normal text-slate-400">(reference only — never fetched or scraped)</span></span>
            <input type="url" value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <div className="rounded-lg bg-sky-50 px-3 py-2 text-[11px] text-sky-800">You enter these facts. They are labelled <strong>“Your fact”</strong> and are never verified by Propellect.</div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Address</span>
            <input required value={form.addressFull} onChange={(e) => set("addressFull", e.target.value)} placeholder="12 Example St, Grange SA 5022" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Suburb (matches official evidence)</span>
              <select value={form.suburbIdx} onChange={(e) => set("suburbIdx", Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {SA_SUBURBS.map((s, i) => <option key={s.geo} value={i}>{s.name} (SA {s.postcode})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Property type</span>
              <select value={form.propertyType} onChange={(e) => set("propertyType", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {["house", "unit", "townhouse", "land", "other"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <label className="block"><span className="text-xs font-medium text-slate-600">Beds</span><input inputMode="numeric" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
            <label className="block"><span className="text-xs font-medium text-slate-600">Baths</span><input inputMode="numeric" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
            <label className="block"><span className="text-xs font-medium text-slate-600">Parking</span><input inputMode="numeric" value={form.parking} onChange={(e) => set("parking", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
            <label className="block"><span className="text-xs font-medium text-slate-600">Land m²</span><input inputMode="numeric" value={form.landAreaSqm} onChange={(e) => set("landAreaSqm", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Price display</span>
              <select value={form.priceDisplay} onChange={(e) => set("priceDisplay", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
                {["exact", "range", "offers_over", "contact_agent", "undisclosed"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-xs font-medium text-slate-600">Price (A$)</span><input inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
            <label className="block"><span className="text-xs font-medium text-slate-600">Upper (range)</span><input inputMode="numeric" value={form.priceUpper} onChange={(e) => set("priceUpper", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" /></label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Listing status</span>
            <select value={form.listingStatus} onChange={(e) => set("listingStatus", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {["for_sale", "under_offer", "sold", "withdrawn"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </label>

          {needsProfile && <BuyBoxRequiredCard surface="byod" />}
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

          <button type="submit" disabled={busy} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">{busy ? "Analysing…" : "Analyse against my buy box"}</button>
        </form>
      )}

      {pendingConfirm && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4" role="dialog" aria-label="Confirm incomplete facts">
          <h2 className="text-sm font-semibold text-amber-900">Some facts are missing</h2>
          <p className="mt-1 text-xs text-amber-800">You left these blank: <strong>{pendingConfirm.missing.join(", ")}</strong>. We won’t assume them. Confirm to score with what you’ve entered — missing items will be clearly labelled and lower the confidence.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => analyze(true)} disabled={busy} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">Confirm & score anyway</button>
            <button onClick={() => setPendingConfirm(null)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-800">Go back and complete</button>
          </div>
        </div>
      )}

      {analysis && d && b && (
        <section className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{b.headline.address}</h2>
                <p className="text-xs text-slate-600">{b.headline.suburb} · {b.headline.propertyType} · {b.headline.priceText ?? "price not entered"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm">Deal <strong>{d.dealScore}</strong> <span className="text-slate-500">({d.dealBand})</span></p>
                <p className="text-[11px] text-slate-500">confidence {b.fit.confidencePct}% · {analysis.bucket.replace("_", " ")}</p>
              </div>
            </div>
            {!d.eligible && (
              <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <strong>Outside your buy box (not hidden):</strong> {d.hardGateFailures.map((f) => f.detail).join(" ")}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => { setShowBrief(true); trackEvent({ name: "founding_beta_deal_brief_opened", surface: "byod" }); }} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700">Deal brief</button>
              <button onClick={() => pipeline("reviewing")} disabled={busy} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700">Save to review</button>
              <button onClick={() => pipeline("rejected", "too_expensive")} disabled={busy} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700">Pass (too expensive)</button>
              <button onClick={() => { setCompare((c) => (c.find((x) => x.listingKey === analysis.listingKey) || c.length >= 3 ? c : [...c, analysis])); }} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700">Add to compare</button>
              <button onClick={() => { setAnalysis(null); setForm(EMPTY); }} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700">Enter another</button>
            </div>
            {saved && <p className="mt-2 text-xs text-emerald-700">Saved to your pipeline as “{saved.replace("_", " ")}”.</p>}
            {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it fits</h3>
              <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">{b.whyMatches.map((s, i) => <li key={i}>{s}</li>)}</ul>
              <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Why it may not</h3>
              <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">{b.whyMayNot.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash flow (estimate) & financials</h3>
              <ul className="mt-1">{b.financials.map((f, i) => <FigureRow key={i} f={f} />)}</ul>
            </div>
          </div>
        </section>
      )}

      {showBrief && b && d && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setShowBrief(false)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-4" role="dialog" aria-label="Deal brief" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h2 className="text-base font-semibold text-slate-900">{b.headline.address}</h2>
              <button onClick={() => setShowBrief(false)} aria-label="Close" className="text-slate-400">✕</button>
            </div>
            <p className="mt-1 text-xs text-slate-600">Deal score {b.fit.dealScore} ({b.fit.dealBand}) · confidence {b.fit.confidencePct}%</p>
            <BriefSection title="Attributes">{b.attributes.map((f, i) => <FigureRow key={i} f={f} />)}</BriefSection>
            <BriefSection title="Financials (modelled)">{b.financials.map((f, i) => <FigureRow key={i} f={f} />)}</BriefSection>
            <BriefSection title="Market evidence">{b.marketEvidence.map((f, i) => <FigureRow key={i} f={f} />)}</BriefSection>
            <BriefList title="Why it fits" items={b.whyMatches} />
            <BriefList title="Why it may not" items={b.whyMayNot} />
            <BriefList title="What could kill the deal" items={b.couldKillDeal} />
            <BriefList title="What to verify next" items={b.verifyNext} />
            <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">{b.disclaimer}</p>
          </div>
        </div>
      )}

      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 border-t border-slate-200 bg-white p-3 lg:bottom-0 lg:z-30">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <span className="text-xs text-slate-600">{compare.length} selected to compare (max 3)</span>
            <div className="flex gap-2">
              <button onClick={() => setCompare([])} className="text-xs text-slate-500 underline">Clear</button>
              <button onClick={() => { setShowCompare(true); trackEvent({ name: "founding_beta_compare_opened", surface: "byod", selectionCount: compare.length }); }} disabled={compare.length < 2} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Compare</button>
            </div>
          </div>
        </div>
      )}

      {showCompare && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCompare(false)}>
          <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-4" role="dialog" aria-label="Compare deals" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between"><h2 className="text-base font-semibold text-slate-900">Compare</h2><button onClick={() => setShowCompare(false)} aria-label="Close">✕</button></div>
            <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: `repeat(${compare.length}, minmax(0,1fr))` }}>
              {compare.map((a) => (
                <div key={a.listingKey} className="rounded-lg border border-slate-200 p-2 text-xs">
                  <p className="font-semibold text-slate-900">{a.brief.headline.suburb}</p>
                  <p className="text-slate-600">{a.brief.headline.priceText ?? "—"}</p>
                  <p>Deal score: <strong>{a.deal.dealScore}</strong> ({a.deal.dealBand})</p>
                  <p>Confidence: {a.brief.fit.confidencePct}%</p>
                  <p>Eligible: {a.deal.eligible ? "yes" : "no"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function BriefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="mt-1">{children}</ul>
    </div>
  );
}
function BriefList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}
