import { describe, expect, it } from "vitest";
import {
  isContractValid,
  isMetricValueValid,
  naturalKey,
  validateObservation,
  type CanonicalObservation,
} from "./observationContract";

const SHA = "a".repeat(64);

function valid(overrides: Partial<CanonicalObservation> = {}): CanonicalObservation {
  return {
    geographyId: "SAL51234",
    geographyType: "SAL",
    geographyLabel: "FREMANTLE",
    state: "WA",
    metric: "weekly_sales_turnover",
    value: 4_200_000,
    unit: "AUD",
    propertyType: "all_residential",
    reportingPeriod: "2026-08-21",
    sourceId: "wa_property_sales",
    sourcePublished: "2026-08-21",
    acquiredAt: "2026-08-23T00:00:00.000Z",
    classification: "direct",
    freshness: "fresh",
    confidence: "medium",
    fileChecksum: SHA,
    adapterVersion: "wa_property_sales@1-candidate",
    schemaVersion: "regional-data-hub-normalised@1",
    sampleSize: 14,
    ...overrides,
  };
}

describe("CanonicalObservation", () => {
  it("accepts a complete, positive, lineage-bearing observation", () => {
    expect(validateObservation(valid())).toEqual([]);
    expect(isContractValid(valid())).toBe(true);
  });

  it("fails closed on missing lineage, invalid dates and fabricated zero", () => {
    const errors = validateObservation(valid({
      value: 0,
      reportingPeriod: "Q1 2026",
      acquiredAt: "not-a-date",
      fileChecksum: "short",
    }));
    expect(errors).toEqual(expect.arrayContaining([
      "value is invalid for metric",
      "reportingPeriod must be an ISO date",
      "acquiredAt must be an ISO timestamp",
      "fileChecksum must be SHA-256",
    ]));
  });

  it("allows signed 12-month growth but keeps price and count metrics positive", () => {
    expect(isMetricValueValid("price_growth_12m", -8.4)).toBe(true);
    expect(isMetricValueValid("annual_price_growth_12m", 0)).toBe(true);
    expect(isMetricValueValid("median_sale_price", 0)).toBe(false);
    expect(isMetricValueValid("weekly_property_sales_count", -1)).toBe(false);
    expect(validateObservation(valid({ metric: "price_growth_12m", value: -8.4, unit: "percent" }))).toEqual([]);
  });

  it("rejects impossible calendar dates and date-only acquisition values", () => {
    expect(validateObservation(valid({ reportingPeriod: "2026-02-31" }))).toContain("reportingPeriod must be an ISO date");
    expect(validateObservation(valid({ acquiredAt: "2026-08-23" }))).toContain("acquiredAt must be an ISO timestamp");
  });

  it("rejects unavailable as an accepted candidate classification", () => {
    expect(validateObservation({ ...valid(), classification: "unavailable" as never })).toContain("classification is invalid");
  });

  it("builds a stable, case-normalised natural key", () => {
    expect(naturalKey(valid())).toBe("wa_property_sales|sal51234|weekly_sales_turnover|all_residential|2026-08-21");
    expect(naturalKey(valid({ geographyId: " sal51234 ", geographyLabel: "Different label" }))).toBe(
      "wa_property_sales|sal51234|weekly_sales_turnover|all_residential|2026-08-21",
    );
  });
});
