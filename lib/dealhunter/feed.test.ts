import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { candidatesToEvidence, loadReplayListings } from "./feed";
import type { CandidateRow, MetricProvenance } from "@/lib/opportunity/types";

function metric(value: number): MetricProvenance {
  return { value, unit: "AUD", sample_size: 1, period_start: null, period_end: "2026-06-30", status: "direct", source_id: "SA-VG", licence: "CC-BY", attribution: "Gov SA", retrieved_at: "2026-06-30T00:00:00Z", provider: "official" };
}

describe("feed helpers", () => {
  it("maps candidate rows to per-suburb evidence, keeping only mandatory metrics", () => {
    const rows: CandidateRow[] = [
      { geography_id: "SAL_40530", jurisdiction: "SA", property_type: "house", metrics: { median_rent: metric(520), gross_yield: metric(3.4), extra_metric: metric(1) } as never },
    ];
    const ev = candidatesToEvidence(rows);
    expect(ev.SAL_40530.median_rent?.value).toBe(520);
    expect(ev.SAL_40530.gross_yield?.value).toBe(3.4);
    expect((ev.SAL_40530 as Record<string, unknown>).extra_metric).toBeUndefined();
  });

  it("loads labelled replay listings as canonical rows", async () => {
    const listings = await loadReplayListings("SA", "sale");
    expect(listings.length).toBeGreaterThan(0);
    expect(listings.every((l) => l.key.startsWith("replay:"))).toBe(true);
  });
});
