import { describe, expect, it } from "vitest";
import { validateObservation, naturalKey as contractNaturalKey } from "../../../lib/warehouse/observationContract";
import { parseSaHouseSales } from "./parse.mjs";
import { REAL_ROWS, SPINE_FIXTURE } from "./fixtures.mjs";
import {
  buildSaHouseResolver,
  classifyFreshness,
  confidenceForSample,
  mapSuburbToGeography,
  naturalKey,
  reconcileObservations,
  toCanonicalObservations,
} from "./normalize.mjs";

const SHA = "a".repeat(64);
const OPTS = { retrievedAt: "2026-08-23T00:00:00Z", resourceSha: SHA };
const resolve = buildSaHouseResolver(SPINE_FIXTURE);

function belairRecord() {
  return parseSaHouseSales(REAL_ROWS, OPTS).records.find((r) => r.suburb === "BELAIR");
}

describe("SA metro house-sales — strict geography mapping", () => {
  it("maps a real suburb to exactly one SAL", () => {
    expect(mapSuburbToGeography({ suburb: "BELAIR" }, resolve)).toEqual({ ok: true, geographyId: "40001", canonicalName: "Belair" });
  });

  it("rejects a zero-match suburb (never guesses)", () => {
    expect(mapSuburbToGeography({ suburb: "SPRINGFIELD" }, resolve)).toEqual({ ok: false, reason: "geography_unmatched" });
  });

  it("rejects an ambiguous suburb (same name, two SALs)", () => {
    expect(mapSuburbToGeography({ suburb: "NEWTOWN" }, resolve)).toEqual({ ok: false, reason: "ambiguous_geography" });
  });
});

describe("SA metro house-sales — canonical observations", () => {
  it("emits a contract-valid DIRECT price + DIRECT publisher growth for an accepted suburb", () => {
    const out = toCanonicalObservations(belairRecord(), resolve, { acquiredAt: OPTS.retrievedAt });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.observations.map((o) => o.metric)).toEqual(["median_sale_price_detached", "annual_price_growth_12m"]);
    expect(out.observations.every((o) => validateObservation(o).length === 0)).toBe(true);

    const price = out.observations[0];
    expect(price).toMatchObject({
      geographyId: "40001", geographyType: "SAL", state: "SA", propertyType: "house",
      value: 1455000, unit: "AUD", classification: "direct", reportingPeriod: "2026-06-30", freshness: "fresh", confidence: "medium",
    });
    const growth = out.observations[1];
    // 0.20546111… ratio → percent, rounded to 4dp; DIRECT (publisher-reported)
    expect(growth).toMatchObject({ metric: "annual_price_growth_12m", unit: "%", classification: "direct", value: 20.5461 });
  });

  it("rejects an invalid source-file checksum", () => {
    const bad = { ...belairRecord(), resource_sha: "not-a-sha" };
    expect(toCanonicalObservations(bad, resolve, { acquiredAt: OPTS.retrievedAt })).toMatchObject({ ok: false, reason: "invalid_source_file_checksum" });
  });

  it("omits growth (never zero-fills) when the publisher leaves Median Change blank", () => {
    const rec = { ...belairRecord(), median_change: null };
    const out = toCanonicalObservations(rec, resolve, { acquiredAt: OPTS.retrievedAt });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.observations.map((o) => o.metric)).toEqual(["median_sale_price_detached"]);
    // no annual_price_growth_12m row, and certainly not a fabricated 0%
    expect(out.observations.some((o) => o.metric === "annual_price_growth_12m")).toBe(false);
  });

  it("preserves a negative publisher growth with sign (signed metric)", () => {
    const rec = { ...belairRecord(), median_change: -0.1874 };
    const out = toCanonicalObservations(rec, resolve, { acquiredAt: OPTS.retrievedAt });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const growth = out.observations.find((o) => o.metric === "annual_price_growth_12m");
    expect(growth?.value).toBe(-18.74);
    expect(validateObservation(growth).length).toBe(0);
  });
});

describe("SA metro house-sales — freshness + confidence helpers", () => {
  it("classifies fresh within the SLA and stale beyond it", () => {
    expect(classifyFreshness("2026-06-30", "2026-08-23T00:00:00Z")).toBe("fresh");
    expect(classifyFreshness("2024-06-30", "2026-08-23T00:00:00Z")).toBe("stale");
    expect(classifyFreshness("2026-06-30", "not-a-date")).toBe("unknown");
  });

  it("uses the shared confidence thresholds", () => {
    expect(confidenceForSample(30)).toBe("high");
    expect(confidenceForSample(16)).toBe("medium");
    expect(confidenceForSample(4)).toBe("low");
  });

  it("uses the same natural key as the observation contract", () => {
    const out = toCanonicalObservations(belairRecord(), resolve, { acquiredAt: OPTS.retrievedAt });
    if (!out.ok) return;
    const row = out.observations[0];
    expect(naturalKey(row)).toBe(contractNaturalKey(row));
  });
});

describe("SA metro house-sales — reconciliation is deterministic", () => {
  it("dedupes identical values and quarantines conflicts", () => {
    const rows = [
      { sourceId: "s", geographyId: "40001", metric: "median_sale_price_detached", propertyType: "house", reportingPeriod: "2026-06-30", value: 1455000 },
      { sourceId: "s", geographyId: "40001", metric: "median_sale_price_detached", propertyType: "house", reportingPeriod: "2026-06-30", value: 1455000 },
      { sourceId: "s", geographyId: "40002", metric: "median_sale_price_detached", propertyType: "house", reportingPeriod: "2026-06-30", value: 1520000 },
      { sourceId: "s", geographyId: "40002", metric: "median_sale_price_detached", propertyType: "house", reportingPeriod: "2026-06-30", value: 1600000 },
    ];
    const { accepted, conflicts, deduped } = reconcileObservations(rows);
    expect(accepted.map((r) => r.geographyId)).toEqual(["40001"]);
    expect(deduped).toBe(1);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.every((c) => c.quarantine_reason === "conflicting_value_same_natural_key")).toBe(true);
  });

  it("produces a stable (geographyId, metric) ordering on repeat runs", () => {
    const rows = [
      { sourceId: "s", geographyId: "40009", metric: "median_sale_price_detached", propertyType: "house", reportingPeriod: "2026-06-30", value: 1 },
      { sourceId: "s", geographyId: "40001", metric: "annual_price_growth_12m", propertyType: "house", reportingPeriod: "2026-06-30", value: 2 },
      { sourceId: "s", geographyId: "40001", metric: "median_sale_price_detached", propertyType: "house", reportingPeriod: "2026-06-30", value: 3 },
    ];
    const first = reconcileObservations(rows).accepted.map((r) => `${r.geographyId}|${r.metric}`);
    const second = reconcileObservations([...rows].reverse()).accepted.map((r) => `${r.geographyId}|${r.metric}`);
    expect(first).toEqual(["40001|annual_price_growth_12m", "40001|median_sale_price_detached", "40009|median_sale_price_detached"]);
    expect(second).toEqual(first);
  });
});
