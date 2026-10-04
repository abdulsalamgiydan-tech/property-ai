"use client";

import { useCallback, useEffect, useState } from "react";

/** One change alert as returned by GET /api/investment/changes. */
interface ChangeAlert {
  id: string;
  geography_id: string;
  metric: string;
  direction: "up" | "down" | "flat" | "new" | "confidence";
  detected_at: string;
  seen_at: string | null;
  message: string;
}

function suburbCode(geographyId: string): string {
  const m = geographyId.match(/(\d{3,})/);
  return m ? m[1] : geographyId;
}

const DIRECTION_STYLE: Record<ChangeAlert["direction"], string> = {
  up: "text-emerald-700 bg-emerald-50 border-emerald-200",
  down: "text-red-700 bg-red-50 border-red-200",
  flat: "text-slate-600 bg-slate-50 border-slate-200",
  new: "text-sky-700 bg-sky-50 border-sky-200",
  confidence: "text-amber-700 bg-amber-50 border-amber-200",
};

const DIRECTION_LABEL: Record<ChangeAlert["direction"], string> = {
  up: "▲ up",
  down: "▼ down",
  flat: "— flat",
  new: "＋ new",
  confidence: "! confidence",
};

/**
 * "What changed on your shortlist" (V7A). On mount it runs the detector (POST)
 * and lists unread change alerts (GET ?unseen=1). Every message is server-rendered
 * from stored official provenance — this component never computes or invents a
 * figure. Rendered only when signed in with a non-empty shortlist; the whole
 * feature is flag-gated server-side (404 when the warehouse preview is off).
 */
export default function ChangeAlerts({ shortlistSize }: { shortlistSize: number }) {
  const [items, setItems] = useState<ChangeAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Idempotent detection first, then read unread alerts.
      await fetch("/api/investment/changes", { method: "POST" });
      const res = await fetch("/api/investment/changes?unseen=1");
      if (!res.ok) {
        // 404 = feature/coverage not available; treat as "no alerts", not an error.
        if (res.status === 404) { setItems([]); return; }
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as { items: ChangeAlert[] };
      setItems(body.items ?? []);
    } catch {
      setError("Couldn’t load change alerts just now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (shortlistSize > 0) void refresh();
  }, [shortlistSize, refresh]);

  const markAllRead = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/investment/changes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      // 404 = nothing was unread; either way the unread list is now empty.
      if (res.ok || res.status === 404) setItems([]);
    } finally {
      setBusy(false);
    }
  }, []);

  if (shortlistSize === 0) return null;
  if (!loading && items.length === 0 && !error) return null; // stay quiet when nothing changed

  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-3" aria-label="Shortlist change alerts">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">
          What changed on your shortlist{items.length > 0 ? ` (${items.length})` : ""}
        </h2>
        {items.length > 0 && (
          <button
            onClick={markAllRead}
            disabled={busy}
            className="text-xs text-slate-500 underline hover:text-slate-800 disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </div>

      {loading && <p className="mt-2 text-xs text-slate-500">Checking for updates…</p>}
      {error && <p className="mt-2 text-xs text-amber-700">{error}</p>}

      {items.length > 0 && (
        <ul className="mt-2 space-y-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-xs">
              <span className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 font-medium ${DIRECTION_STYLE[a.direction]}`}>
                {DIRECTION_LABEL[a.direction]}
              </span>
              <span className="text-slate-700">
                <a href={`/research/suburb/${suburbCode(a.geography_id)}`} className="font-medium text-slate-800 underline">
                  Suburb {suburbCode(a.geography_id)}
                </a>
                {" — "}
                {a.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-slate-500">
        Alerts fire only on official data refreshes for your shortlisted suburbs. Figures are quoted from source — never forecasts or advice.
      </p>
    </section>
  );
}
