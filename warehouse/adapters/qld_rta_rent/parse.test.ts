import { describe, expect, it } from "vitest";
import { parseQldRtaRent, PARSER_VERSION } from "./parse.mjs";
import { validRows, driftedRows } from "./fixtures.mjs";

const retrievedAt = "2026-08-02T00:00:00Z";

describe("parseQldRtaRent", () => {
  it("fails closed on schema drift and transforms nothing", () => {
    const r = parseQldRtaRent({ rows: driftedRows, retrievedAt });
    expect(r.drift).toBe(true);
    expect(r.driftReason).toMatch(/schema drift/);
    expect(r.observations).toHaveLength(0);
  });

  it("parses valid rows with full provenance and preserves property type + bedroom grouping", () => {
    const r = parseQldRtaRent({ rows: validRows, retrievedAt });
    expect(r.drift).toBe(false);
    const unit = r.observations.find((o) => o.property_type === "unit");
    expect(unit).toMatchObject({
      metric: "median_rent",
      unit: "AUD/week",
      state: "QLD",
      postcode: "4006",
      bedroom_group: "2",
      observation_period: "2026-03-31",
      sample_size: 310,
      parser_version: PARSER_VERSION,
      geography_level: "postcode",
      status: "contextual", // never assumed to be a suburb match without an authoritative bridge
    });
    expect(unit.value).toBe(620);
  });

  it("quarantines rows below the minimum bond sample (never lowered to inflate coverage)", () => {
    const r = parseQldRtaRent({ rows: validRows, retrievedAt, minBondSample: 10 });
    const q = r.quarantined.find((x) => x.sample_size === 9);
    expect(q?.quarantine_reason).toBe("insufficient_sample");
  });

  it("quarantines rows with an unparseable postcode rather than guessing geography", () => {
    const r = parseQldRtaRent({ rows: validRows, retrievedAt });
    expect(r.quarantined.some((x) => x.quarantine_reason === "geography_unmatched")).toBe(true);
  });

  it("every output row (observation or quarantine) carries a metric, provenance and reason where applicable", () => {
    const r = parseQldRtaRent({ rows: validRows, retrievedAt });
    for (const o of r.observations) expect(o.parser_version).toBe(PARSER_VERSION);
    for (const q of r.quarantined) expect(q.quarantine_reason).toBeTruthy();
  });
});
