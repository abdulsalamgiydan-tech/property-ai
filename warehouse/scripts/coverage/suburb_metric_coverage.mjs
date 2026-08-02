#!/usr/bin/env node
/**
 * Suburb-level metric coverage report (read-only).
 *
 * Counts, across ALL canonical suburb (SAL) snapshots, how many have a populated
 * value for each key metric — the honest baseline that "every suburb has a
 * geography record" deliberately hides. Uses the public read-only warehouse
 * views via PostgREST HEAD+count; makes NO writes and NO Stash calls.
 *
 * Metrics that do not exist in the Propellect warehouse at all (vacancy, days on
 * market, longer-term growth) are reported as gaps that a licensed Stash
 * integration would fill — never silently omitted.
 *
 * Usage: node warehouse/scripts/coverage/suburb_metric_coverage.mjs [--json <path>]
 */
import fs from "fs";

function loadEnvLocal() {
  if (!fs.existsSync(".env.local")) return {};
  return Object.fromEntries(
    fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
  );
}

const env = { ...loadEnvLocal(), ...process.env };
const url = env.WAREHOUSE_SUPABASE_URL;
const key = env.WAREHOUSE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("WAREHOUSE_SUPABASE_URL / WAREHOUSE_SUPABASE_ANON_KEY not configured");
  process.exit(1);
}
const base = url.replace(/\/$/, "") + "/rest/v1";
const H = { apikey: key, Authorization: `Bearer ${key}` };

// Metrics resident in the suburb snapshot view; each is counted as "populated"
// when non-null. Metrics not present in the warehouse are listed separately.
const VIEW = "v_suburb_market_snapshot_v1";
const WAREHOUSE_METRICS = [
  ["median_house_price", "median_sale_price_detached"],
  ["median_unit_price", "median_sale_price_apartment"],
  ["median_sale_price_overall", "median_sale_price_12m"],
  ["median_weekly_rent", "median_weekly_rent_latest"],
  ["gross_yield", "gross_yield_pct"],
  ["annual_price_growth_12m", "annual_price_change_pct"],
  ["sales_volume_12m", "sales_volume_12m"],
  ["dwelling_stock", "dwelling_stock_total"],
  ["approvals_12m", "approvals_12m"],
  ["population", "total_population"],
  ["population_growth_2016_2021", "population_growth_2016_2021_pct"],
  ["repayment_owner_occupier", "est_monthly_repayment_owner_occupier"],
  ["repayment_investor", "est_monthly_repayment_investor"],
  ["sales_turnover_pct", "sales_turnover_pct"],
  ["rba_rate", "rba_rate_used"],
];
const NOT_IN_WAREHOUSE = ["vacancy_rate", "days_on_market", "growth_3yr", "growth_5yr", "growth_10yr"];

async function countWhere(qs) {
  const res = await fetch(`${base}/${VIEW}?${qs}`, { method: "HEAD", headers: { ...H, Prefer: "count=exact" } });
  const cr = res.headers.get("content-range") || "";
  const total = cr.includes("/") ? Number(cr.split("/")[1]) : NaN;
  return total;
}

const total = await countWhere("select=geography_id&limit=1");
const rows = [];
for (const [label, col] of WAREHOUSE_METRICS) {
  const populated = await countWhere(`${col}=not.is.null&select=geography_id&limit=1`);
  rows.push({ metric: label, column: col, source: "warehouse", populated, missing: total - populated, pct: total ? Number(((populated / total) * 100).toFixed(1)) : 0 });
}
for (const label of NOT_IN_WAREHOUSE) {
  rows.push({ metric: label, column: null, source: "not_in_warehouse", populated: 0, missing: total, pct: 0, note: "Stash-fallback candidate — not held in the Propellect warehouse" });
}

const report = { generated_at: new Date().toISOString(), view: VIEW, total_suburb_snapshots: total, metrics: rows };

console.log(`\nSuburb metric coverage — ${total.toLocaleString()} SAL snapshots (${VIEW})\n`);
console.log("metric".padEnd(30) + "populated".padStart(11) + "missing".padStart(11) + "coverage".padStart(11) + "  source");
for (const r of rows) {
  console.log(
    r.metric.padEnd(30) +
      String(r.populated).padStart(11) +
      String(r.missing).padStart(11) +
      `${r.pct}%`.padStart(11) +
      `  ${r.source}`
  );
}

const jsonIdx = process.argv.indexOf("--json");
if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
  fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(report, null, 2));
  console.log(`\nWrote ${process.argv[jsonIdx + 1]}`);
}
