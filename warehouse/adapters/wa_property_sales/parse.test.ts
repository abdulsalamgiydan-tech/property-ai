import { describe, expect, it } from "vitest";
import {
  EXPECTED_SCHEMA_FINGERPRINT,
  PARSER_VERSION,
  parseWaPropertySales,
} from "./parse.mjs";
import { DRIFTED_ROWS, NORMALISED_ROWS } from "./fixtures.mjs";

const OPTS = { retrievedAt: "2026-08-23T00:00:00Z", resourceSha: "a".repeat(64) };

describe("WA weekly property-sales candidate parser", () => {
  it("accepts the versioned normalised contract deterministically", () => {
    const first = parseWaPropertySales(NORMALISED_ROWS, OPTS);
    const second = parseWaPropertySales(NORMALISED_ROWS, OPTS);
    expect(first.drift).toBe(false);
    expect(first.schemaFingerprint).toBe(EXPECTED_SCHEMA_FINGERPRINT);
    expect(first.records.map((row) => row.suburb)).toEqual(["ALBANY", "FREMANTLE", "SPRINGFIELD"]);
    expect(first.records).toEqual(second.records);
    expect(first.records.every((row) => row.parser_version === PARSER_VERSION)).toBe(true);
  });

  it("quarantines every invalid row with an explicit reason", () => {
    const parsed = parseWaPropertySales(NORMALISED_ROWS, OPTS);
    expect(parsed.quarantined.map((row) => row.quarantine_reason).sort()).toEqual([
      "non_positive_or_suppressed_sales_count",
      "non_positive_or_suppressed_turnover",
      "unparseable_period",
      "wrong_state",
    ]);
  });

  it("refuses header drift rather than guessing column meanings", () => {
    const result = parseWaPropertySales(DRIFTED_ROWS, OPTS);
    expect(result.drift).toBe(true);
    expect(result.records).toEqual([]);
    expect(result.driftReason).toMatch(/schema drift/);
  });

  it("never emits a median or house-price field", () => {
    const record = parseWaPropertySales(NORMALISED_ROWS, OPTS).records[0];
    expect(Object.keys(record).some((key) => /median|house_price/i.test(key))).toBe(false);
  });
});
