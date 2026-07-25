import { describe, it, expect } from "vitest";
import { executeRule, RULE_EXECUTORS } from "./rule_engine.mjs";

// A queue-based fake pg client: each call to .query() pops the next
// scripted response. This mirrors the shape real executors use (a count
// query, then optionally an evidence query) without touching a real
// database — deliberately failing AND passing fixtures for every rule
// family, per this workstream's own validation requirement.
function makeFakeClient(responses) {
  const queue = [...responses];
  return {
    query: async () => {
      if (queue.length === 0) throw new Error("fake client ran out of scripted responses");
      return { rows: queue.shift() };
    },
  };
}

describe("rule_engine — every blocking rule family has a passing AND a deliberately failing fixture", () => {
  it("duplicate_natural_key: passes when no duplicates, fails when duplicates exist", async () => {
    const passRule = { rule_id: "r1", rule_family: "duplicate_natural_key", target_schema: "mart", target_table: "suburb_market_snapshot", expected_threshold: { key_columns: ["geography_id"] } };
    const passClient = makeFakeClient([[]]);
    const passResult = await executeRule(passClient, passRule);
    expect(passResult.passed).toBe(true);

    const failClient = makeFakeClient([[{ geography_id: "SAL_1", n: 2 }, { geography_id: "SAL_2", n: 3 }]]);
    const failResult = await executeRule(failClient, passRule);
    expect(failResult.passed).toBe(false);
    expect(failResult.affectedRowCount).toBe(5);
    expect(failResult.evidence.length).toBe(2);
  });

  it("duplicate_natural_key: accepts the coalesce(col,'') key-column pattern but rejects arbitrary SQL", async () => {
    const rule = { rule_id: "r1b", rule_family: "duplicate_natural_key", target_schema: "mart", target_table: "suburb_market_snapshot", expected_threshold: { key_columns: ["geography_id", "coalesce(dwelling_type,'')"] } };
    const client = makeFakeClient([[]]);
    await expect(executeRule(client, rule)).resolves.toEqual(expect.objectContaining({ passed: true }));

    const maliciousRule = { rule_id: "r1c", rule_family: "duplicate_natural_key", target_schema: "mart", target_table: "x", expected_threshold: { key_columns: ["geography_id; drop table x; --"] } };
    await expect(executeRule(makeFakeClient([]), maliciousRule)).rejects.toThrow(/unsafe identifier/);
  });

  it("null_required_field: passes when zero nulls, fails and returns evidence when nulls exist", async () => {
    const rule = { rule_id: "r2", rule_family: "null_required_field", target_schema: "core", target_table: "fact_dwelling_construction_activity", expected_threshold: { column: "unit_count" } };
    const passResult = await executeRule(makeFakeClient([[{ n: 0 }]]), rule);
    expect(passResult.passed).toBe(true);

    const failResult = await executeRule(makeFakeClient([[{ n: 3 }], [{ id: 1 }, { id: 2 }]]), rule);
    expect(failResult.passed).toBe(false);
    expect(failResult.affectedRowCount).toBe(3);
  });

  it("orphan_geography: passes when no orphans, fails when a fact row references a nonexistent geography", async () => {
    const rule = { rule_id: "r3", rule_family: "orphan_geography", target_schema: "core", target_table: "fact_rental_market_summary" };
    const passResult = await executeRule(makeFakeClient([[{ n: 0 }]]), rule);
    expect(passResult.passed).toBe(true);

    const failResult = await executeRule(makeFakeClient([[{ n: 1 }], [{ geography_id: "SAL_999999" }]]), rule);
    expect(failResult.passed).toBe(false);
    expect(failResult.evidence[0].geography_id).toBe("SAL_999999");
  });

  it("negative_value: passes at zero, fails on a genuine negative price", async () => {
    const rule = { rule_id: "r4", rule_family: "negative_value", target_schema: "mart", target_table: "suburb_market_snapshot", expected_threshold: { column: "median_sale_price_12m" } };
    expect((await executeRule(makeFakeClient([[{ n: 0 }]]), rule)).passed).toBe(true);
    const fail = await executeRule(makeFakeClient([[{ n: 1 }], [{ median_sale_price_12m: -500 }]]), rule);
    expect(fail.passed).toBe(false);
  });

  it("range_check: catches an impossible percentage (rejects both below-min and above-max)", async () => {
    const rule = { rule_id: "r5", rule_family: "range_check", target_schema: "mart", target_table: "suburb_market_snapshot", expected_threshold: { column: "renter_household_pct", min: 0, max: 100 } };
    expect((await executeRule(makeFakeClient([[{ n: 0 }]]), rule)).passed).toBe(true);
    const fail = await executeRule(makeFakeClient([[{ n: 2 }], [{ renter_household_pct: 150 }, { renter_household_pct: -5 }]]), rule);
    expect(fail.passed).toBe(false);
    expect(fail.affectedRowCount).toBe(2);
  });

  it("missing_confidence_label: fails when a value exists without a matching confidence label", async () => {
    const rule = { rule_id: "r6", rule_family: "missing_confidence_label", target_schema: "mart", target_table: "suburb_market_snapshot", expected_threshold: { value_column: "median_sale_price_12m", confidence_column: "sales_sample_confidence" } };
    expect((await executeRule(makeFakeClient([[{ n: 0 }]]), rule)).passed).toBe(true);
    const fail = await executeRule(makeFakeClient([[{ n: 1 }], [{ geography_id: "SAL_1" }]]), rule);
    expect(fail.passed).toBe(false);
  });

  it("future_dated_observation: catches an impossible future reference_period (this is the exact WS1 2032 bug)", async () => {
    const rule = { rule_id: "r7", rule_family: "future_dated_observation", target_schema: "core", target_table: "fact_residential_sales_summary", expected_threshold: { period_column: "reference_period" } };
    expect((await executeRule(makeFakeClient([[{ n: 0 }]]), rule)).passed).toBe(true);
    const fail = await executeRule(makeFakeClient([[{ n: 2 }], [{ geography_id: "SAL_12348", reference_period: "2032-01-01" }, { geography_id: "POA_2070", reference_period: "2032-01-01" }]]), rule);
    expect(fail.passed).toBe(false);
    expect(fail.affectedRowCount).toBe(2);
  });

  it("future_dated_observation: a quarantined row no longer counts as a failure once excluded via exclude_quarantined_column", async () => {
    const rule = { rule_id: "r7b", rule_family: "future_dated_observation", target_schema: "core", target_table: "fact_residential_sales_summary", expected_threshold: { period_column: "reference_period", exclude_quarantined_column: "data_quality_status" } };
    const result = await executeRule(makeFakeClient([[{ n: 0 }]]), rule);
    expect(result.passed).toBe(true);
  });

  it("invalid_geometry: fails on a topologically invalid boundary", async () => {
    const rule = { rule_id: "r8", rule_family: "invalid_geometry", target_schema: "core", target_table: "dim_geography", expected_threshold: { geom_column: "geom" } };
    expect((await executeRule(makeFakeClient([[{ n: 0 }]]), rule)).passed).toBe(true);
    const fail = await executeRule(makeFakeClient([[{ n: 1 }], [{ geography_id: "SAL_1", reason: "Self-intersection" }]]), rule);
    expect(fail.passed).toBe(false);
  });

  it("weight_reconciliation: fails when correspondence weights don't sum close to 1.0", async () => {
    const rule = { rule_id: "r9", rule_family: "weight_reconciliation", expected_threshold: { tolerance_pct: 1.0 } };
    expect((await executeRule(makeFakeClient([[]]), rule)).passed).toBe(true);
    const fail = await executeRule(makeFakeClient([[{ source_geography_id: "SSC_1", correspondence_version: "v1", total_weight: 0.85 }]]), rule);
    expect(fail.passed).toBe(false);
  });

  it("row_count_anomaly: passes on first run (no baseline) with data present, fails on an empty replacement dataset", async () => {
    const rule = { rule_id: "r10", rule_family: "row_count_anomaly", target_schema: "mart", target_table: "suburb_market_snapshot", expected_threshold: { filter_sql: "true", max_pct_change: 20 } };
    const firstRun = await executeRule(makeFakeClient([[{ n: 15000 }], []]), rule);
    expect(firstRun.passed).toBe(true);

    const emptyReplacement = await executeRule(makeFakeClient([[{ n: 0 }], []]), rule);
    expect(emptyReplacement.passed).toBe(false);

    const collapse = await executeRule(makeFakeClient([[{ n: 5000 }], [{ row_count: "15000" }]]), rule);
    expect(collapse.passed).toBe(false);
    expect(collapse.actualResult.pct_change).toBeCloseTo(-66.67, 1);

    const withinTolerance = await executeRule(makeFakeClient([[{ n: 15100 }], [{ row_count: "15000" }]]), rule);
    expect(withinTolerance.passed).toBe(true);
  });

  it("stale_source: fails when any dataset is stale or critical", async () => {
    const rule = { rule_id: "r11", rule_family: "stale_source" };
    expect((await executeRule(makeFakeClient([[]]), rule)).passed).toBe(true);
    const fail = await executeRule(makeFakeClient([[{ dataset_id: "qld_rta_bond_statistics", freshness_status: "stale" }]]), rule);
    expect(fail.passed).toBe(false);
  });

  it("broken_source_url: fails on a non-2xx response and rejects HTML masquerading as a data file", async () => {
    const rule = { rule_id: "r12", rule_family: "broken_source_url", expected_threshold: { reject_html_for: ["abs_building_activity"] } };
    const okFetch = async () => ({ ok: true, status: 200, headers: new Map([["content-type", "application/vnd.ms-excel"]]) });
    const passResult = await executeRule(makeFakeClient([[{ source_id: "abs_building_activity", source_url: "https://example.test/file.xlsx" }]]), rule, { fetchImpl: okFetch });
    expect(passResult.passed).toBe(true);

    const htmlFetch = async () => ({ ok: true, status: 200, headers: new Map([["content-type", "text/html; charset=utf-8"]]) });
    const htmlResult = await executeRule(makeFakeClient([[{ source_id: "abs_building_activity", source_url: "https://example.test/moved" }]]), rule, { fetchImpl: htmlFetch });
    expect(htmlResult.passed).toBe(false);
    expect(htmlResult.evidence[0].reason).toMatch(/HTML/);

    const brokenFetch = async () => ({ ok: false, status: 404, headers: new Map() });
    const brokenResult = await executeRule(makeFakeClient([[{ source_id: "qld_rent", source_url: "https://example.test/gone" }]]), rule, { fetchImpl: brokenFetch });
    expect(brokenResult.passed).toBe(false);
    expect(brokenResult.evidence[0].reason).toBe("HTTP 404");
  });

  it("schema_drift: fails when an expected column is missing", async () => {
    const rule = { rule_id: "r13", rule_family: "schema_drift", target_schema: "mart", target_table: "suburb_market_snapshot", expected_threshold: { expected_columns: ["geography_id", "median_sale_price_12m"] } };
    const pass = await executeRule(makeFakeClient([[{ column_name: "geography_id" }, { column_name: "median_sale_price_12m" }]]), rule);
    expect(pass.passed).toBe(true);
    const fail = await executeRule(makeFakeClient([[{ column_name: "geography_id" }]]), rule);
    expect(fail.passed).toBe(false);
    expect(fail.actualResult.missing).toEqual(["median_sale_price_12m"]);
  });

  it("checksum_change: is always informational (never fails the run) but still surfaces changes", async () => {
    const rule = { rule_id: "r14", rule_family: "checksum_change" };
    const result = await executeRule(makeFakeClient([[{ source_id: "qld_rent", file_hash: "abc", prev_hash: "def" }]]), rule);
    expect(result.passed).toBe(true);
    expect(result.actualResult.changed_count).toBe(1);
  });

  it("every registered rule_family in the catalogue has a matching executor (build_rule_catalogue.mjs's own pre-check, exercised directly)", async () => {
    const { RULE_CATALOGUE } = await import("./rule_catalogue.mjs");
    for (const rule of RULE_CATALOGUE) {
      expect(RULE_EXECUTORS[rule.ruleFamily], `rule ${rule.ruleId} references unknown family ${rule.ruleFamily}`).toBeDefined();
    }
  });
});

describe("cross_border_geography_join — classifies the WS8 anomaly without guessing", () => {
  it("flags a postcode whose heuristic jurisdiction contradicts its sales_source, and leaves genuinely-matching rows alone", async () => {
    const rule = { rule_id: "r15", rule_family: "cross_border_geography_join" };
    const client = makeFakeClient([
      [
        { geography_id: "POA_4380", geography_code: "4380", sales_volume_12m: 3, sales_source: "nsw_vg_sales" }, // QLD-range code, NSW source -> anomaly
        { geography_id: "POA_2000", geography_code: "2000", sales_volume_12m: 400, sales_source: "nsw_vg_sales" }, // NSW-range code, NSW source -> fine
      ],
    ]);
    const result = await executeRule(client, rule);
    expect(result.passed).toBe(false);
    expect(result.affectedRowCount).toBe(1);
    expect(result.evidence[0].geography_code).toBe("4380");
  });
});
