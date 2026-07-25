"use client";

import { useState } from "react";
import { METRIC_GLOSSARY, type MetricFamily } from "@/lib/warehouse/metricGlossary";
import { trackEvent } from "@/lib/analytics/events";

type LineageData = {
  found: boolean;
  jurisdiction: string | null;
  row_confidence: string | null;
  is_derived: boolean | null;
  transformation_method: string | null;
  correspondence_version: string | null;
  source_name: string | null;
  publisher: string | null;
  source_url: string | null;
  licence: string | null;
  dataset_name: string | null;
  lineage_complete: boolean;
};

// Sprint 12 WS12 — surfaces WS8's field-level lineage (via WS11's
// /api/v1/metrics/.../lineage endpoint) directly next to the metric it
// describes. Fetches on first expand, not on page load, to avoid an
// N-metric-cards x 1-request-each burst on every snapshot page view —
// this is genuinely supplementary detail, not part of the page's
// critical data.
export function AboutThisMetric({
  geographyId,
  geographyType,
  metricFamily,
}: {
  geographyId: string;
  geographyType: "suburb" | "postcode";
  metricFamily: MetricFamily;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LineageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const martTable = geographyType === "suburb" ? "suburb_market_snapshot" : "postcode_market_snapshot";
  const glossary = METRIC_GLOSSARY[metricFamily];

  async function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    trackEvent({ name: "metric_explanation_opened", metricFamily });
    if (data || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/metrics/${encodeURIComponent(geographyId)}/${martTable}/${metricFamily}`);
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Lineage unavailable");
        return;
      }
      setData(body.data as LineageData);
    } catch {
      setError("Lineage unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={handleToggle}
        className="text-[10px] text-zinc-500 underline decoration-dotted underline-offset-2 transition hover:text-zinc-300"
        aria-expanded={open}
      >
        About this metric
      </button>
      {open && (
        <div className="mt-1.5 max-w-sm rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 text-[11px] leading-relaxed text-zinc-400">
          <div className="space-y-1 border-b border-zinc-800/70 pb-2">
            <p className="text-zinc-300">{glossary.definition}</p>
            {glossary.formula && (
              <p>
                <span className="text-zinc-300">Formula:</span> {glossary.formula}
              </p>
            )}
            <p>
              <span className="text-zinc-300">Confidence:</span> {glossary.confidenceMeaning}
            </p>
            <p className="text-zinc-500">{glossary.knownLimitations}</p>
          </div>
          <div className="pt-2">
            {loading && <p>Loading source details…</p>}
            {error && <p className="text-red-300">{error}</p>}
            {data && !data.found && <p>No source lineage recorded yet for this metric at this geography.</p>}
            {data && data.found && (
            <div className="space-y-1">
              {data.source_name && (
                <p>
                  <span className="text-zinc-300">Source:</span> {data.source_name}
                  {data.publisher ? ` (${data.publisher})` : ""}
                </p>
              )}
              {data.dataset_name && (
                <p>
                  <span className="text-zinc-300">Dataset:</span> {data.dataset_name}
                </p>
              )}
              {data.transformation_method && (
                <p>
                  <span className="text-zinc-300">Method:</span> {data.transformation_method} ({data.is_derived ? "derived" : "direct"})
                </p>
              )}
              {data.licence && (
                <p>
                  <span className="text-zinc-300">Licence:</span> {data.licence}
                </p>
              )}
              {data.source_url && (
                <p>
                  <a href={data.source_url} target="_blank" rel="noreferrer" className="text-zinc-300 underline hover:text-zinc-100">
                    View source ↗
                  </a>
                </p>
              )}
              {!data.lineage_complete && <p className="text-amber-400">Lineage not yet fully registered for this metric.</p>}
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
