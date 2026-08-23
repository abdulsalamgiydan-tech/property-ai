import { describe, expect, it } from "vitest";
import {
  REQUIRED_MIGRATIONS, SA_HOUSE_PRICE_BATCH, assertExecutionPreconditions,
  candidateBatchToRows, candidateCoreFields, candidateMartFields, candidateToOfficialRow,
  classifyExistingCore, classifyExistingMart, computeExpectedDeltas, expectedMartRowCount,
  missingMigrations, observationId, officialObservationValues, sanitise, sanitisedPlan,
  toWarehouseGeographyId, validateBranchRef,
} from "./saHousePricePromotion.mjs";

const PRICE = { metric: "median_sale_price_detached", geographyId: "40085", propertyType: "house", reportingPeriod: "2026-06-30", value: 1455000, sampleSize: 16, periodStart: "2026-04-01" };
const GROWTH = { metric: "annual_price_growth_12m", geographyId: "40085", propertyType: "house", reportingPeriod: "2026-06-30", value: -6.11, sampleSize: 16, periodStart: "2025-06-30" };
const BRANCH = "lzonauinzatmtytyoems";
const PROD = SA_HOUSE_PRICE_BATCH.prodRef;
const directUrl = (ref: string) => `postgresql://postgres:password@db.${ref}.supabase.co/postgres`;
const poolerUrl = (ref: string) => `postgresql://postgres.${ref}:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

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
    const r = assertExecutionPreconditions({ execute: false, rollbackValidation: true, dbUrl: directUrl(BRANCH), branchRef: BRANCH, prodRef: PROD, rowCount: 1, rowCap: 340 });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("missing_execute_flag");
  });

  it("refuses execute mode without the rollback-validation flag", () => {
    const r = assertExecutionPreconditions({ execute: true, rollbackValidation: false, dbUrl: directUrl(BRANCH), branchRef: BRANCH, prodRef: PROD, rowCount: 340, rowCap: 340 });
    expect(r.errors).toContain("missing_rollback_validation_flag");
  });

  it("refuses a Production ref", () => {
    expect(validateBranchRef(directUrl(PROD), { prodRef: PROD, branchRef: BRANCH }))
      .toEqual({ ok: false, reason: "production_ref_detected" });
  });

  it("refuses a URL that does not reference the given branch ref", () => {
    expect(validateBranchRef(directUrl("anotherprojectref123"), { prodRef: PROD, branchRef: BRANCH }))
      .toEqual({ ok: false, reason: "url_does_not_reference_branch_ref" });
  });

  it("accepts exact direct-host and pooler-username branch refs but rejects substrings", () => {
    expect(validateBranchRef(directUrl(BRANCH), { prodRef: PROD, branchRef: BRANCH }).ok).toBe(true);
    expect(validateBranchRef(poolerUrl(BRANCH), { prodRef: PROD, branchRef: BRANCH }).ok).toBe(true);
    expect(validateBranchRef(directUrl(`prefix${BRANCH}suffix`), { prodRef: PROD, branchRef: BRANCH }).ok).toBe(false);
  });

  it("refuses a missing branch ref and a missing url", () => {
    expect(validateBranchRef(directUrl(BRANCH), { prodRef: PROD }).reason).toBe("missing_branch_ref");
    expect(validateBranchRef("", { prodRef: PROD, branchRef: BRANCH }).reason).toBe("missing_db_url");
  });

  it("refuses when the row cap is exceeded", () => {
    const r = assertExecutionPreconditions({ execute: true, rollbackValidation: true, dbUrl: directUrl(BRANCH), branchRef: BRANCH, prodRef: PROD, rowCount: 341, rowCap: 340, sourceSha: SA_HOUSE_PRICE_BATCH.resourceSha256, expectedSha: SA_HOUSE_PRICE_BATCH.resourceSha256 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e: string) => e.startsWith("row_cap_exceeded"))).toBe(true);
  });

  it("refuses on checksum and schema-fingerprint drift", () => {
    const r = assertExecutionPreconditions({
      execute: true, rollbackValidation: true, dbUrl: directUrl(BRANCH), branchRef: BRANCH, prodRef: PROD, rowCount: 1, rowCap: 340,
      sourceSha: "deadbeef", expectedSha: SA_HOUSE_PRICE_BATCH.resourceSha256,
      schemaFingerprint: "changed", expectedFingerprint: SA_HOUSE_PRICE_BATCH.schemaFingerprint,
    });
    expect(r.errors).toContain("checksum_drift");
    expect(r.errors).toContain("schema_fingerprint_drift");
  });

  it("accepts a valid non-Production branch load within the cap and identity", () => {
    const r = assertExecutionPreconditions({
      execute: true, rollbackValidation: true, dbUrl: directUrl(BRANCH), branchRef: BRANCH, prodRef: PROD,
      rowCount: 340, rowCap: 340, sourceSha: SA_HOUSE_PRICE_BATCH.resourceSha256, expectedSha: SA_HOUSE_PRICE_BATCH.resourceSha256,
      schemaFingerprint: SA_HOUSE_PRICE_BATCH.schemaFingerprint, expectedFingerprint: SA_HOUSE_PRICE_BATCH.schemaFingerprint, expectedRowCount: 340,
    });
    expect(r).toEqual({ ok: true, errors: [] });
  });
});

describe("atomic comparison primitives + sanitisation", () => {
  it("requires all migration ledger entries without applying them", () => {
    expect(missingMigrations(["056", "057", "058"])).toEqual([]);
    expect(missingMigrations(["056", "058"])).toEqual(["057"]);
    expect(REQUIRED_MIGRATIONS).toEqual(["056", "057", "058"]);
  });

  it("classifies exact rows, new rows and conflicts field-by-field", () => {
    const row = candidateToOfficialRow(PRICE);
    expect(classifyExistingCore(row, undefined)).toEqual({ kind: "new" });
    expect(classifyExistingCore(row, candidateCoreFields(row))).toEqual({ kind: "exact" });
    expect(classifyExistingCore(row, { ...candidateCoreFields(row), value: row.val + 1 })).toMatchObject({ kind: "conflict", field: "value" });
    expect(classifyExistingMart(row, candidateMartFields(row))).toEqual({ kind: "exact" });
    expect(classifyExistingMart(row, { ...candidateMartFields(row), status: "derived" })).toMatchObject({ kind: "conflict", field: "status" });
  });

  it("computes exact new/existing deltas and exposes conflicts", () => {
    const deltas = computeExpectedDeltas(
      [{ kind: "new" }, { kind: "exact" }],
      [{ kind: "new" }, { kind: "conflict", field: "value" }],
    );
    expect(deltas).toMatchObject({ expected_core_delta: 1, expected_mart_delta: 1, has_conflict: true });
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
