import { describe, expect, it } from "vitest";
import { validateObservation } from "../../../lib/warehouse/observationContract";
import { runLocalQualityGates } from "../../scripts/quality/local_quality_gates.mjs";
import { NORMALISED_ROWS, SPINE_FIXTURE } from "./fixtures.mjs";
import { mapSuburbToGeography, toCanonicalObservations } from "./normalize.mjs";
import { EXPECTED_SCHEMA_FINGERPRINT, parseWaPropertySales } from "./parse.mjs";

const SHA = "c".repeat(64);
const OPTS = { retrievedAt: "2026-08-23T00:00:00Z", resourceSha: SHA };

describe("WA sales candidate — fixture to canonical offline review", () => {
  it("normalises a uniquely mapped record and passes the offline gates", () => {
    const parsed = parseWaPropertySales(NORMALISED_ROWS, OPTS);
    const record = parsed.records.find((row) => row.suburb === "FREMANTLE");
    const normalised = toCanonicalObservations(record, SPINE_FIXTURE);
    expect(normalised.ok).toBe(true);
    if (!normalised.ok) return;
    expect(normalised.observations).toHaveLength(2);
    expect(normalised.observations.every((row) => validateObservation(row).length === 0)).toBe(true);
    expect(normalised.observations.map((row) => row.metric)).toEqual([
      "weekly_property_sales_count",
      "weekly_property_sales_turnover",
    ]);

    const gates = runLocalQualityGates({
      sourceId: "wa_property_sales",
      expectedSourceId: "wa_property_sales",
      sourceLicence: "CC BY 4.0",
      expectedLicence: "CC BY 4.0",
      schemaFingerprint: parsed.schemaFingerprint,
      priorSchemaFingerprint: EXPECTED_SCHEMA_FINGERPRINT,
      fileMeta: { mime: "text/csv", bytes: 900, looksHtml: false, complete: true },
      rows: normalised.observations,
      quarantined: parsed.quarantined,
    });
    expect(gates.admit).toBe(true);
    expect(gates.quarantinedRows).toBe(4);
  });

  it("rejects zero-match, ambiguous mapping and an invalid checksum", () => {
    expect(mapSuburbToGeography("NOWHERE", "WA", SPINE_FIXTURE).ok).toBe(false);
    expect(mapSuburbToGeography("SPRINGFIELD", "WA", SPINE_FIXTURE).ok).toBe(false);
    const record = parseWaPropertySales(NORMALISED_ROWS, OPTS).records.find((row) => row.suburb === "ALBANY");
    expect(toCanonicalObservations({ ...record, resource_sha: "bad" }, SPINE_FIXTURE)).toMatchObject({ ok: false, reason: "invalid_source_file_checksum" });
  });
});
