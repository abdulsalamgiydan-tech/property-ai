/**
 * Shared logic behind validate_metric_lineage_completeness.mjs (Sprint 12
 * WS8) — extracted as an importable function so
 * warehouse/scripts/quality/rule_engine.mjs (Sprint 12 WS9's
 * missing_lineage rule) has exactly one implementation to call rather than
 * a second copy of this logic drifting out of sync.
 */
import { postcodeToState } from "../lib/postcode_to_state.mjs";

// metric_family -> representative column used to test "does this
// jurisdiction actually have non-null data for this metric family".
export const METRIC_FAMILY_COLUMNS = {
  sales: "sales_volume_12m",
  rent: "median_weekly_rent_latest",
  yield: "gross_yield_pct",
  approvals: "approvals_12m",
  dwelling_stock: "dwelling_stock_total",
  demographics: "total_population",
  population_growth: "population_growth_2016_2021_pct",
  affordability: "est_monthly_repayment_owner_occupier",
};

const STATE_TO_JURISDICTION = { "1": "NSW", "2": "VIC", "3": "QLD", "4": "SA", "5": "WA", "6": "TAS", "7": "NT", "8": "ACT" };

/** @param {import('pg').Client} client */
export async function validateLineageCompleteness(client) {
  const q = async (sql, params = []) => (await client.query(sql, params)).rows;

  const registryRows = await q("select mart_table, metric_name, jurisdiction_code, mandatory from meta.metric_lineage_registry");
  const registryIndex = new Map();
  for (const r of registryRows) {
    const key = `${r.mart_table}|${r.metric_name}`;
    if (!registryIndex.has(key)) registryIndex.set(key, new Map());
    registryIndex.get(key).set(r.jurisdiction_code ?? "__NATIONAL__", r.mandatory);
  }

  const results = [];
  for (const martTable of ["suburb_market_snapshot", "postcode_market_snapshot"]) {
    const geoType = martTable === "suburb_market_snapshot" ? "SAL" : "POA";
    for (const [metricName, col] of Object.entries(METRIC_FAMILY_COLUMNS)) {
      const rows = await q(
        `select d.state_code, d.geography_code, count(*)::int as n
         from mart.${martTable} m
         join core.dim_geography d on d.geography_id = m.geography_id
         where m.dwelling_type is null and m.${col} is not null
         group by 1, 2`
      );
      if (rows.length === 0) continue;
      const jurisdictionsWithData = new Set();
      for (const r of rows) {
        const state = r.state_code ?? (geoType === "POA" ? postcodeToState(r.geography_code) : null);
        if (state) jurisdictionsWithData.add(state);
      }
      const registryKey = `${martTable}|${metricName}`;
      const registryEntry = registryIndex.get(registryKey);
      for (const state of jurisdictionsWithData) {
        const jur = STATE_TO_JURISDICTION[state];
        if (!jur) continue;
        const hasNational = registryEntry?.has("__NATIONAL__");
        const hasSpecific = registryEntry?.has(jur);
        const covered = hasNational || hasSpecific;
        const mandatory = hasSpecific ? registryEntry.get(jur) : hasNational ? registryEntry.get("__NATIONAL__") : true;
        results.push({ martTable, metricName, jurisdiction: jur, covered, mandatory });
      }
    }
  }

  const total = results.length;
  const covered = results.filter((r) => r.covered).length;
  const gaps = results.filter((r) => !r.covered);
  const mandatoryGapCount = gaps.filter((r) => r.mandatory).length;
  const completenessPct = total > 0 ? Math.round((covered / total) * 1000) / 10 : 100;

  return { total, covered, completenessPct, gaps, mandatoryGapCount, verdict: mandatoryGapCount === 0 ? "PASSED" : "FAILED" };
}
