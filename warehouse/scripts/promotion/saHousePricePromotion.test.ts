import { describe, expect, it } from "vitest";
import {
  SA_HOUSE_PRICE_BATCH, assertExecutionPreconditions, buildScopedSql, candidateBatchToRows,
  candidateToOfficialRow, expectedMartRowCount, observationId, officialObservationValues,
  sanitise, sanitisedPlan, toWarehouseGeographyId, validateBranchRef,
} from "./saHousePricePromotion.mjs";

const PRICE = { metric: "median_sale_price_detached", geographyId: "40085", propertyType: "house", reportingPeriod: "2026-06-30", value: 1455000, sampleSize: 16, periodStart: "2026-04-01" };
const GROWTH = { metric: "annual_price_growth_12m", geographyId: "40085", propertyType: "house", reportingPeriod: "2026-06-30", value: -6.11, sampleSize: 16, periodStart: "2025-06-30" };
const BRANCH = "lzonauinzatmtytyoems";
const PROD = SA_HOUSE_PRICE_BATCH.prodRef;

describe("candidate → official-observation transformation", () => {
  it("maps the detached price to median_house_price/house (DIRECT), never the overall 12m price", () => {
    const r = candidateToOfficialRow(PRICE);
    expect(r.metric).toBe("median_house_price");
    expect(r.pt).toBe("house");
    expect(r.status).toBe("direct");
    expect(r.unit).toBe("AUD");
    expect(r.metric).not.toBe("median_sale_price_12m");
    expect(r.geo).toBe("SAL_40085_ASGS3_2021");
  });

  it("maps the growth to price_growth_12m/house (DERIVED), signed value preserved", () => {
    const r = candidateToOfficialRow(GROWTH);
    expect(r.metric).toBe("price_growth_12m");
    expect(r.status).toBe("derived");
    expect(r.unit).toBe("%");
    expect(r.val).toBe(-6.11);
    expect(r.formula).toBe("publisher_median_change@1");
  });

  it("carries the real retrieved_at and resource checksum through the 22-col params", () => {
    const params = officialObservationValues(candidateToOfficialRow(PRICE));
    expect(params).toHaveLength(22);
    expect(params[2]).toBe(SA_HOUSE_PRICE_BATCH.resourceSha256); // resource_sha256
    expect(params[21]).toBe(SA_HOUSE_PRICE_BATCH.retrievedAt);   // retrieved_at (real, not falsified)
    expect(params[14]).toBe("direct");                            // status
  });

  it("throws on an unmapped candidate metric and on an invalid SAL code (never guesses)", () => {
    expect(() => candidateToOfficialRow({ ...PRICE, metric: "median_rent" })).toThrow(/unmapped_candidate_metric/);
    expect(() => toWarehouseGeographyId("abc")).toThrow(/invalid_sal_code/);
  });

  it("produces deterministic, content-addressed ids (idempotent) that differ per metric", () => {
    expect(candidateToOfficialRow(PRICE).id).toBe(candidateToOfficialRow(PRICE).id);
    expect(candidateToOfficialRow(PRICE).id).not.toBe(candidateToOfficialRow(GROWTH).id);
    expect(observationId(["a", "b"]).startsWith("obs_")).toBe(true);
  });

  it("expected mart rows = unique (geo,metric,pt,bg,pe); duplicates collapse", () => {
    const rows = candidateBatchToRows([PRICE, PRICE, GROWTH]);
    expect(expectedMartRowCount(rows)).toBe(2); // one price key + one growth key
  });
});

describe("environment guards", () => {
  it("refuses without the --execute flag", () => {
    const r = assertExecutionPreconditions({ execute: false, dbUrl: `x-${BRANCH}-x`, branchRef: BRANCH, prodRef: PROD, rowCount: 1, rowCap: 340 });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("missing_execute_flag");
  });

  it("refuses a Production ref", () => {
    expect(validateBranchRef(`postgresql://u:p@db.${PROD}.co/x`, { prodRef: PROD, branchRef: BRANCH }))
      .toEqual({ ok: false, reason: "production_ref_detected" });
  });

  it("refuses a URL that does not reference the given branch ref", () => {
    expect(validateBranchRef(`postgresql://u:p@db.other.co/x`, { prodRef: PROD, branchRef: BRANCH }))
      .toEqual({ ok: false, reason: "url_does_not_reference_branch_ref" });
  });

  it("refuses a missing branch ref and a missing url", () => {
    expect(validateBranchRef(`x-${BRANCH}-x`, { prodRef: PROD }).reason).toBe("missing_branch_ref");
    expect(validateBranchRef("", { prodRef: PROD, branchRef: BRANCH }).reason).toBe("missing_db_url");
  });

  it("refuses when the row cap is exceeded", () => {
    const r = assertExecutionPreconditions({ execute: true, dbUrl: `x-${BRANCH}-x`, branchRef: BRANCH, prodRef: PROD, rowCount: 341, rowCap: 340, sourceSha: SA_HOUSE_PRICE_BATCH.resourceSha256, expectedSha: SA_HOUSE_PRICE_BATCH.resourceSha256 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e: string) => e.startsWith("row_cap_exceeded"))).toBe(true);
  });

  it("refuses on checksum and schema-fingerprint drift", () => {
    const r = assertExecutionPreconditions({
      execute: true, dbUrl: `x-${BRANCH}-x`, branchRef: BRANCH, prodRef: PROD, rowCount: 1, rowCap: 340,
      sourceSha: "deadbeef", expectedSha: SA_HOUSE_PRICE_BATCH.resourceSha256,
      schemaFingerprint: "changed", expectedFingerprint: SA_HOUSE_PRICE_BATCH.schemaFingerprint,
    });
    expect(r.errors).toContain("checksum_drift");
    expect(r.errors).toContain("schema_fingerprint_drift");
  });

  it("accepts a valid non-Production branch load within the cap and identity", () => {
    const r = assertExecutionPreconditions({
      execute: true, dbUrl: `postgresql://u:p@db.${BRANCH}.co/x`, branchRef: BRANCH, prodRef: PROD,
      rowCount: 340, rowCap: 340, sourceSha: SA_HOUSE_PRICE_BATCH.resourceSha256, expectedSha: SA_HOUSE_PRICE_BATCH.resourceSha256,
      schemaFingerprint: SA_HOUSE_PRICE_BATCH.schemaFingerprint, expectedFingerprint: SA_HOUSE_PRICE_BATCH.schemaFingerprint,
    });
    expect(r).toEqual({ ok: true, errors: [] });
  });
});

describe("scoped cleanup + sanitisation", () => {
  it("scopes cleanup/rollback ONLY by source_id + resource_sha256", () => {
    const sql = buildScopedSql();
    expect(sql.cleanupCore).toMatch(/where source_id = \$1 and resource_sha256 = \$2/);
    expect(sql.cleanupMart).toMatch(/source_id = \$1/);
    expect(sql.cleanupCore).not.toMatch(/drop |truncate/i);
  });

  it("redacts connection strings, emails and tokens", () => {
    expect(sanitise("connect postgresql://user:secret@db.host.co/prod now")).not.toMatch(/secret/);
    expect(sanitise("contact abdul@example.com")).toContain("[redacted]");
    expect(sanitise("token eyJabcdef12345 more")).toContain("[redacted]");
    expect(sanitise("password=hunter2")).toContain("[redacted]");
  });

  it("sanitised plan exposes only counts + identifiers (no per-row secrets/values)", () => {
    const plan = sanitisedPlan(candidateBatchToRows([PRICE, GROWTH]));
    expect(plan.core_rows).toBe(2);
    expect(plan.by_status).toEqual({ direct: 1, derived: 1 });
    expect(plan.within_cap).toBe(true);
    expect(plan.upsert_key_mart).toBe("(geography_id, metric, property_type, bedroom_group, period_end)");
  });
});
