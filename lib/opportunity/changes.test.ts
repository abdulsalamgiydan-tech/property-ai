import { describe, expect, it } from "vitest";
import { detectMetricChanges, explainChange, type MetricSnapshot } from "./changes";
import type { MetricProvenance } from "./types";

function m(value: number, period_end: string, over: Partial<MetricProvenance> = {}): MetricProvenance {
  return {
    value,
    unit: "AUD",
    sample_size: 100,
    period_start: null,
    period_end,
    status: "direct",
    source_id: "SA-VG",
    licence: "CC-BY",
    attribution: "Government of SA",
    retrieved_at: `${period_end}T00:00:00Z`,
    provider: "official",
    ...over,
  };
}

describe("detectMetricChanges — determinism + no fabrication", () => {
  it("emits a value-advance event only when the period advances, in fixed metric order", () => {
    const prev: MetricSnapshot = {
      median_house_price: m(700000, "2025-03-31"),
      gross_yield: m(4.2, "2025-03-31"),
      price_growth_12m: m(5.0, "2025-03-31"),
    };
    const curr: MetricSnapshot = {
      median_house_price: m(735000, "2025-06-30"), // advanced + up
      gross_yield: m(4.2, "2025-03-31"), // same period → ignored
      price_growth_12m: m(3.0, "2025-06-30"), // advanced + down
    };
    const changes = detectMetricChanges(prev, curr);
    expect(changes.map((c) => `${c.metric}:${c.direction}`)).toEqual([
      "median_house_price:up",
      "price_growth_12m:down",
    ]);
    const price = changes[0];
    expect(price.oldValue).toBe(700000);
    expect(price.newValue).toBe(735000);
    expect(price.pctChange).toBeCloseTo(5.0, 1);
  });

  it("is a pure function — identical inputs give identical output ordering across runs", () => {
    const prev: MetricSnapshot = { gross_yield: m(4.0, "2025-03-31"), sales_volume: m(30, "2025-03-31") };
    const curr: MetricSnapshot = { gross_yield: m(4.6, "2025-06-30"), sales_volume: m(41, "2025-06-30") };
    const a = JSON.stringify(detectMetricChanges(prev, curr));
    const b = JSON.stringify(detectMetricChanges(prev, curr));
    expect(a).toBe(b);
  });

  it("a metric that goes missing yields a confidence event with NO invented value", () => {
    const prev: MetricSnapshot = { median_rent: m(520, "2025-03-31") };
    const curr: MetricSnapshot = {}; // rent gone
    const [c] = detectMetricChanges(prev, curr);
    expect(c.direction).toBe("confidence");
    expect(c.newValue).toBeNull();
    expect(c.oldValue).toBe(520); // last-known retained for context, not re-presented as current
    expect(c.attribution).toBe("Government of SA");
  });

  it("a metric that goes stale (old period at asOf) yields a confidence event", () => {
    const prev: MetricSnapshot = { median_house_price: m(700000, "2023-06-30") };
    const curr: MetricSnapshot = { median_house_price: m(700000, "2023-06-30") };
    const [c] = detectMetricChanges(prev, curr, { asOf: new Date("2025-08-09"), hardStaleDays: 540 });
    expect(c.direction).toBe("confidence");
    expect(c.newValue).toBeNull();
  });

  it("minChangePct suppresses micro-moves but never confidence/new events", () => {
    const prev: MetricSnapshot = { median_house_price: m(700000, "2025-03-31"), median_rent: m(500, "2025-03-31") };
    const curr: MetricSnapshot = {
      median_house_price: m(701000, "2025-06-30"), // +0.14% → suppressed at 2%
      // median_rent disappears → confidence, must still surface
    };
    const changes = detectMetricChanges(prev, curr, { minChangePct: 2 });
    expect(changes.map((c) => `${c.metric}:${c.direction}`)).toEqual(["median_rent:confidence"]);
  });

  it("a brand-new metric appearing is reported as 'new'", () => {
    const changes = detectMetricChanges({}, { gross_yield: m(4.5, "2025-06-30") });
    expect(changes).toHaveLength(1);
    expect(changes[0].direction).toBe("new");
    expect(changes[0].newValue).toBe(4.5);
  });
});

describe("explainChange — provenance-mapped, no forecast/recommendation", () => {
  it("states the delta with source, period, and attribution", () => {
    const [c] = detectMetricChanges(
      { price_growth_12m: m(4.2, "2025-03-31") },
      { price_growth_12m: m(6.1, "2025-06-30") },
    );
    const s = explainChange(c);
    expect(s).toContain("12-month price growth rose from 4.20% to 6.10%");
    expect(s).toContain("SA-VG · 2025-06-30");
    expect(s).toContain("Source: Government of SA.");
    // never editorialises cause or advises action
    expect(s.toLowerCase()).not.toMatch(/should|recommend|buy|forecast|expect/);
  });

  it("money metrics format as A$ and confidence events say last-known, not current", () => {
    const [up] = detectMetricChanges(
      { median_house_price: m(700000, "2025-03-31") },
      { median_house_price: m(735000, "2025-06-30") },
    );
    expect(explainChange(up)).toContain("A$700,000 to A$735,000");

    const [conf] = detectMetricChanges({ median_rent: m(520, "2025-03-31") }, {});
    const cs = explainChange(conf);
    expect(cs).toContain("can no longer confirm a current median rent");
    expect(cs).toContain("last known A$520");
  });
});
