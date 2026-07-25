"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import type { MapMarker } from "@/lib/warehouse/queries";

// Australia's approximate bounds, matching the RPC's own validated range
// (migration 020) — used both as the map's initial view and as a client-side
// sanity clamp before calling the API.
const AUSTRALIA_BOUNDS: [[number, number], [number, number]] = [
  [-44, 112],
  [-9, 154],
];
// The RPC's own hard-validated range (migration 020) — slightly tighter
// than AUSTRALIA_BOUNDS above, which is only the initial fitBounds target.
const RPC_VALID_RANGE = { minLat: -45, maxLat: -8, minLon: 108, maxLon: 156 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type GeographyTypeFilter = "" | "SAL" | "POA" | "LGA";

function formatCurrency(v: number | null): string {
  if (v === null) return "—";
  return `$${Math.round(v).toLocaleString()}`;
}

function markerColor(m: MapMarker): string {
  // Colour encodes DATA TYPE (what's available), never a value judgement —
  // this project's hard rule forbids any colour-coded "good/bad suburb"
  // implication. Blue = full snapshot (sales+rent), amber = rent-only.
  return m.has_full_snapshot ? "#38bdf8" : "#f59e0b";
}

export function MarketMapExplorer() {
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [geographyType, setGeographyType] = useState<GeographyTypeFilter>("SAL");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fetchMarkers = useCallback(async (bounds: import("leaflet").LatLngBounds, type: GeographyTypeFilter) => {
    setLoading(true);
    setError(null);
    try {
      // Leaflet's fitBounds()/panning can render a viewport wider than the
      // fitted target (aspect-ratio padding) — clamp to the RPC's own
      // validated range before calling it, rather than sending an
      // out-of-range box that the RPC correctly refuses.
      const minLat = clamp(bounds.getSouth(), RPC_VALID_RANGE.minLat, RPC_VALID_RANGE.maxLat);
      const maxLat = clamp(bounds.getNorth(), RPC_VALID_RANGE.minLat, RPC_VALID_RANGE.maxLat);
      const minLon = clamp(bounds.getWest(), RPC_VALID_RANGE.minLon, RPC_VALID_RANGE.maxLon);
      const maxLon = clamp(bounds.getEast(), RPC_VALID_RANGE.minLon, RPC_VALID_RANGE.maxLon);
      if (minLat >= maxLat || minLon >= maxLon) {
        // Current view is entirely outside Australia's range — nothing to show.
        setMarkers([]);
        setTruncated(false);
        return;
      }
      const params = new URLSearchParams({
        minLat: String(minLat),
        maxLat: String(maxLat),
        minLon: String(minLon),
        maxLon: String(maxLon),
      });
      if (type) params.set("type", type);
      const res = await fetch(`/api/research/map-markers?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const body = (await res.json()) as { markers: MapMarker[] };
      setMarkers(body.markers);
      setTruncated(body.markers.length >= 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load markers");
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Leaflet needs `window`/`document` — initialise only on the client, after mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true }).fitBounds(AUSTRALIA_BOUNDS);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layer;

      const onMoveEnd = () => fetchMarkers(map.getBounds(), geographyTypeRef.current);
      map.on("moveend", onMoveEnd);
      fetchMarkers(map.getBounds(), geographyTypeRef.current);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a ref in sync so the moveend handler (registered once) reads the
  // current filter without re-registering the listener on every change.
  const geographyTypeRef = useRef(geographyType);
  useEffect(() => {
    geographyTypeRef.current = geographyType;
    if (mapRef.current) fetchMarkers(mapRef.current.getBounds(), geographyType);
  }, [geographyType, fetchMarkers]);

  // Render markers whenever the marker list changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !layerRef.current) return;
      layerRef.current.clearLayers();
      for (const m of markers) {
        const circle = L.circleMarker([m.centroid_lat, m.centroid_lon], {
          radius: 6,
          color: markerColor(m),
          fillColor: markerColor(m),
          fillOpacity: 0.75,
          weight: 1,
        });
        const href = m.geography_type === "POA" ? `/research/postcode/${m.geography_code}` : `/research/suburb/${m.geography_code}`;
        circle.bindPopup(
          `<div style="font-size:13px;line-height:1.5">
            <strong>${m.geography_name}</strong> ${m.jurisdiction ? `(${m.jurisdiction})` : ""}<br/>
            ${m.median_sale_price_12m !== null ? `Median sale price (12m): ${formatCurrency(m.median_sale_price_12m)}<br/>` : ""}
            ${m.median_weekly_rent_latest !== null ? `Median weekly rent: ${formatCurrency(Number(m.median_weekly_rent_latest))}<br/>` : ""}
            <a href="${href}" style="color:#38bdf8">View full profile &rarr;</a>
          </div>`
        );
        circle.addTo(layerRef.current);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markers]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["SAL", "POA", "LGA"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setGeographyType(t)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                geographyType === t
                  ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                  : "border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {t === "SAL" ? "Suburbs" : t === "POA" ? "Postcodes" : "LGAs"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400" /> Full snapshot (sales + rent)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Rent only
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-[560px] w-full overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-950"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <span>
          {loading ? "Loading markers…" : `${markers.length} geograph${markers.length === 1 ? "y" : "ies"} shown in this view`}
          {truncated ? " — zoom in to see more (500 marker limit per view)" : ""}
        </span>
        {error ? <span className="text-red-400">{error}</span> : null}
      </div>

      <p className="text-xs leading-relaxed text-zinc-500">
        Markers show only whether sale price and/or rent data is loaded for that geography —
        colour is never a value judgement, ranking, or recommendation.{" "}
        <Link href="/research/explore" className="text-sky-400 hover:underline">
          Prefer a list view? Use Explore.
        </Link>
      </p>
    </div>
  );
}
