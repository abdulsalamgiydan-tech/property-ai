import { describe, expect, it } from "vitest";
import { validateObservation } from "../../../lib/warehouse/observationContract";
import { runLocalQualityGates } from "../../scripts/quality/local_quality_gates.mjs";
import { parseSaHouseSales, SOURCE_ID } from "./parse.mjs";
import { DEDUP_CONFLICT_ROWS, REAL_ROWS, SPINE_FIXTURE } from "./fixtures.mjs";
import { buildSaHouseResolver, reconcileObservations, toCanonicalObservations } from "./normalize.mjs";

const SHA = "c".repeat(64);
const OPTS = { retrievedAt: "2026-08-23T00:00:00Z", resourceSha: SHA };
const SCHEMA_FP = "a".repeat(64);
const resolve = buildSaHouseResolver(SPINE_FIXTURE);

/** Full offline slice: raw rows → parse → normalise → reconcile. */
function pipeline(rows) {
  const parsed = parseSaHouseSales(rows, OPTS);
  const quarantined = parsed.quarantined.map((q) => ({ ...q, stage: "parse" }));
  const observations = [];
  for (const record of parsed.records) {
    const out = toCanonicalObservations(record, resolve, { acquiredAt: OPTS.retrievedAt });
    if (!out.ok) { quarantined.push({ suburb: record.suburb, quarantine_reason: out.reason, stage: "geography" }); continue; }
    observations.push(...out.observations);
  }
  const { accepted, conflicts, deduped } = reconcileObservations(observations);
  return { parsed, accepted, quarantined: [...quarantined, ...conflicts], deduped };
}

describe("SA metro house-sales — fixture to canonical offline review", () => {
  it("normalises real rows and passes every offline quality gate", () => {
    const { parsed, accepted, quarantined } = pipeline(REAL_ROWS);

    expect(accepted.every((row) => validateObservation(row).length === 0)).toBe(true);
    // BELAIR + STIRLING × (price + growth) = 4 accepted rows
    expect(accepted).toHaveLength(4);
    expect([...new Set(accepted.map((r) => r.geographyId))].sort()).toEqual(["40001", "40002"]);
    expect(accepted.filter((r) => r.metric === "median_sale_price_detached")).toHaveLength(2);
    expect(accepted.filter((r) => r.metric === "annual_price_growth_12m")).toHaveLength(2);

    const gates = runLocalQualityGates({
      sourceId: SOURCE_ID,
      expectedSourceId: SOURCE_ID,
      sourceLicence: "CC BY 4.0",
      expectedLicence: "CC BY 4.0",
      schemaFingerprint: parsed.schemaFingerprint ?? SCHEMA_FP,
      fileMeta: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: 37459, looksHtml: false, complete: true },
      minimumSampleSize: 10,
      rows: accepted,
      quarantined,
    });
    expect(gates.admit).toBe(true);
    expect(gates.acceptedRows).toBe(4);
    // ADELAIDE, ALDGATE, ASHTON, BALHANNAH quarantined at parse (sample/suppressed)
    expect(gates.quarantinedRows).toBe(4);
    expect(gates.failures).toHaveLength(0);
  });

  it("dedupes identical duplicate suburbs and quarantines conflicting ones", () => {
    const { accepted, quarantined, deduped } = pipeline(DEDUP_CONFLICT_ROWS);
    // BELAIR appears twice identically → deduped (price + growth each dedupe once)
    expect(deduped).toBe(2);
    expect([...new Set(accepted.map((r) => r.geographyId))]).toEqual(["40001"]);
    // STIRLING appears twice with conflicting medians → both price + both growth quarantined
    const conflicts = quarantined.filter((q) => q.quarantine_reason === "conflicting_value_same_natural_key");
    expect(conflicts).toHaveLength(4);
    expect(conflicts.every((c) => c.geographyId === "40002")).toBe(true);
  });

  it("is idempotent — a second run yields identical natural keys and totals", () => {
    const first = pipeline(REAL_ROWS);
    const second = pipeline(REAL_ROWS);
    const keys = (batch) => batch.accepted.map((r) => `${r.geographyId}|${r.metric}`).sort();
    expect(keys(second)).toEqual(keys(first));
    expect(second.accepted.map((r) => r.value)).toEqual(first.accepted.map((r) => r.value));
    expect(second.quarantined.length).toBe(first.quarantined.length);
  });

  it("quarantines a zero-match suburb rather than guessing a SAL", () => {
    const rows = [
      REAL_ROWS[0],
      ["ADELAIDE HILLS", "SPRINGFIELD", 40, 900000, 42, 1000000, 0.1], // not in spine
    ];
    const { accepted, quarantined } = pipeline(rows);
    expect(accepted).toHaveLength(0);
    expect(quarantined.some((q) => q.suburb === "SPRINGFIELD" && q.quarantine_reason === "geography_unmatched")).toBe(true);
  });
});
