#!/usr/bin/env node
/**
 * Phase 2/3 (V2.1) — NSW suburb gross-yield LINEAGE AUDIT + safe materialiser.
 *
 * TRUTH-FIRST. This no longer claims a "materialised" yield from simplified
 * snapshot gates. It requalifies every naive price+rent overlap candidate
 * against the FULL warehouse contract (lib/warehouse/yieldLineage.ts). A yield
 * is materialised ONLY when both inputs independently prove real upstream
 * observation ids, same canonical geography/version, independent direct suburb
 * status, a permitted house/unit property type (NEVER aggregate 'all'), matching
 * bedroom groups, ACTUAL sample sizes ≥ minimum, compatible periods and
 * freshness. The public read-only warehouse interfaces expose none of the
 * per-observation lineage (no observation ids, no actual counts, no bedroom
 * groups; the medians are aggregate 'all'), so the expected, honest result is
 * ZERO promotion-ready yields — reported as such, not weakened to preserve one.
 *
 * SAFETY:
 *   - default mode is genuinely READ-ONLY: NO filesystem writes or deletions.
 *   - --apply-local is REQUIRED for any write; raw is content-addressed and an
 *     identical existing raw file is reused (never overwritten/deleted).
 *   - DuckDB runs IN-MEMORY (no db file created or deleted).
 *   - dates are emitted as ISO strings; volatile timestamps are reported
 *     separately from the deterministic payload.
 *
 * Usage: node warehouse/scripts/coverage/materialise_nsw_yield.mjs [--apply-local]
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DuckDBInstance } from "@duckdb/node-api";

// Mirror of the canonical, unit-tested contract in lib/warehouse/yieldLineage.ts
// (kept in lockstep). Reimplemented here as plain JS so this CLI has no .ts
// import (CI/node-20 safe). If the .ts contract changes, update this too.
const ALLOWED_YIELD_TYPES = new Set(["house", "unit"]);
function qualifyYield(ev, opts) {
  const reasons = [];
  const req = (cond, why) => { if (!cond) reasons.push(why); };
  req(!!ev.price.observationId, "price: no proven upstream observation id");
  req(!!ev.rent.observationId, "rent: no proven upstream observation id");
  req(!!ev.price.geographyId && ev.price.geographyId === ev.rent.geographyId, "inputs are not the same canonical geography id");
  req(!!ev.price.asgsVersion && ev.price.asgsVersion === ev.rent.asgsVersion, "inputs are not the same ASGS geography version");
  req(ev.price.geographyLevel === "suburb", "price is not suburb-level");
  req(ev.rent.geographyLevel === "suburb", "rent is not suburb-level");
  req(ev.price.directStatus === "direct", "price is not an independently-direct suburb observation");
  req(ev.rent.directStatus === "direct", "rent is not an independently-direct suburb observation");
  const pt = ev.price.propertyType;
  req(pt != null && ALLOWED_YIELD_TYPES.has(pt), `price property_type ${pt ?? "null"} not permitted for gross yield (house/unit only)`);
  req(ev.rent.propertyType != null && ev.rent.propertyType === pt, "price and rent property types differ");
  req((ev.price.bedroomGroup ?? null) === (ev.rent.bedroomGroup ?? null), "bedroom groupings differ");
  req(ev.price.sampleSize != null && ev.price.sampleSize >= opts.minSample, "price actual sample size below minimum");
  req(ev.rent.sampleSize != null && ev.rent.sampleSize >= opts.minSample, "rent actual sample size below minimum");
  req(ev.price.value != null && ev.price.value > 0 && ev.rent.value != null && ev.rent.value > 0, "invalid/non-positive value");
  const havePeriods = ev.price.periodEnd && ev.rent.periodEnd;
  req(!!havePeriods, "missing period start/end on one or both inputs");
  if (havePeriods) {
    const gap = Math.abs(new Date(ev.price.periodEnd).getTime() - new Date(ev.rent.periodEnd).getTime()) / 86_400_000;
    req(gap <= opts.maxPeriodGapDays, `period windows exceed ${opts.maxPeriodGapDays}d compatibility`);
  }
  req(ev.price.ageDays != null && ev.price.ageDays <= opts.freshnessSlaDays, "price stale beyond SLA");
  req(ev.rent.ageDays != null && ev.rent.ageDays <= opts.freshnessSlaDays, "rent stale beyond SLA");
  if (reasons.length === 0) return { qualified: true, disposition: "materialised_local", reasons: [], derivedId: "yield_" + crypto.createHash("sha256").update(`${ev.price.observationId}|${ev.rent.observationId}|gross_yield@2`).digest("hex").slice(0, 24) };
  const disposition =
    reasons.some((r) => r.includes("observation id") || r.includes("ASGS") || r.includes("independently-direct") || r.includes("suburb-level"))
      ? (reasons.some((r) => r.includes("independently-direct") || r.includes("suburb-level")) ? "context_only" : "lineage_unverified")
      : reasons.some((r) => r.includes("property_type") || r.includes("property types")) ? "incompatible_property_type"
      : reasons.some((r) => r.includes("bedroom")) ? "incompatible_bedroom_group"
      : reasons.some((r) => r.includes("sample")) ? "insufficient_sample"
      : reasons.some((r) => r.includes("period")) ? "incompatible_period"
      : reasons.some((r) => r.includes("stale")) ? "stale" : "invalid_value";
  return { qualified: false, disposition, reasons, derivedId: null };
}

const APPLY = process.argv.includes("--apply-local");
const DATA_DIR = "warehouse/data/local";
const REPORT_DIR = "warehouse/reports/coverage_v2";
const RAW_JSON = path.join(DATA_DIR, "nsw_yield_candidates.json");
const MANIFEST = path.join(DATA_DIR, "nsw_yield_candidates.manifest.json");

const OPTS = { minSample: 10, maxPeriodGapDays: 400, freshnessSlaDays: 400 };
const REFERENCE_NOW = "2026-08-02"; // fixed reference for deterministic freshness

function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(".env.local")) {
    for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      if (!l.includes("=")) continue;
      const i = l.indexOf("=");
      const k = l.slice(0, i).trim();
      if (!(k in env)) env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

async function fetchCandidates(env) {
  const base = env.WAREHOUSE_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
  const H = { apikey: env.WAREHOUSE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.WAREHOUSE_SUPABASE_ANON_KEY}` };
  const cols = "geography_id,geography_code,geography_name,state_code,median_sale_price_12m,median_weekly_rent_latest,latest_sales_period,latest_rent_period,sales_sample_confidence,rent_confidence,direct_or_derived,snapshot_generated_at";
  const endpoint = `${base}/v_suburb_market_snapshot_v1?median_sale_price_12m=not.is.null&median_weekly_rent_latest=not.is.null&gross_yield_pct=is.null&state_code=eq.1&select=${cols}&order=geography_id`;
  const rows = await (await fetch(endpoint, { headers: H })).json();
  // Representative lineage (NSW row_provenance is row-uniform: sales=nsw_vg_sales, rent=nsw_dcj).
  let provenance = null;
  if (rows[0]) {
    const lin = await (await fetch(`${base}/rpc/get_metric_lineage_v1`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ p_geography_id: rows[0].geography_id, p_mart_table: "suburb_market_snapshot", p_metric_family: "rent" }),
    })).json();
    provenance = Array.isArray(lin) ? lin[0]?.row_provenance ?? null : null;
  }
  return { rows, endpoint, provenance };
}

function asgsVersionOf(gid) {
  const m = String(gid).match(/(ASGS\d+_\d{4})$/);
  return m ? m[1] : null;
}
function ageDays(periodEnd) {
  if (!periodEnd) return null;
  return Math.round((new Date(REFERENCE_NOW).getTime() - new Date(periodEnd).getTime()) / 86_400_000);
}

/**
 * Build per-input evidence from the snapshot. Critically, the snapshot exposes
 * NO upstream observation id, NO actual sample size, NO bedroom group, and the
 * medians are aggregate ('all') — so those evidence fields are null/'all' and
 * the contract cannot be satisfied. We do not invent ids or samples.
 */
function evidenceFor(c) {
  const gid = c.geography_id;
  const asgs = asgsVersionOf(gid);
  const common = {
    observationId: null, // NOT exposed by the read-only contract — never synthesised
    geographyId: gid,
    asgsVersion: asgs,
    geographyLevel: "suburb",
    bedroomGroup: null, // NOT exposed
    sampleSize: null, // NOT exposed (only a confidence label)
    qualityStatus: c.direct_or_derived === "direct" ? "passed" : null,
  };
  return {
    price: {
      ...common,
      directStatus: "direct", // sales = nsw_vg_sales, is_derived=false
      propertyType: "all", // median_sale_price_12m is an aggregate median
      periodStart: null,
      periodEnd: c.latest_sales_period,
      sourceId: "nsw_vg_sales",
      value: c.median_sale_price_12m,
      ageDays: ageDays(c.latest_sales_period),
    },
    rent: {
      ...common,
      directStatus: "direct", // rent lineage is_derived=false, but see disposition reasons
      propertyType: "all", // median_weekly_rent_latest is an aggregate median
      periodStart: null,
      periodEnd: c.latest_rent_period,
      sourceId: "nsw_dcj_rent_and_sales_report",
      value: c.median_weekly_rent_latest,
      ageDays: ageDays(c.latest_rent_period),
    },
  };
}

async function main() {
  const env = loadEnv();
  if (!env.WAREHOUSE_SUPABASE_URL || !env.WAREHOUSE_SUPABASE_ANON_KEY) {
    console.error("FAIL CLOSED: warehouse read-only creds not configured.");
    process.exit(1);
  }

  const { rows, endpoint, provenance } = await fetchCandidates(env);

  // Requalify every candidate against the full contract.
  const results = rows.map((c) => {
    const q = qualifyYield(evidenceFor(c), OPTS);
    return { geography_id: c.geography_id, geography_code: c.geography_code, geography_name: c.geography_name, disposition: q.disposition, qualified: q.qualified, reasons: q.reasons, derivedId: q.derivedId };
  });
  const dispo = results.reduce((m, r) => ((m[r.disposition] = (m[r.disposition] || 0) + 1), m), {});
  const materialised = results.filter((r) => r.qualified);

  // In-memory DuckDB — SQL reconciliation only, no db file touched.
  const db = await DuckDBInstance.create(":memory:");
  const con = await db.connect();
  await con.run(`CREATE TABLE audit (geography_id VARCHAR, disposition VARCHAR, qualified BOOLEAN);`);
  const app = await con.createAppender("audit");
  for (const r of results) { app.appendVarchar(r.geography_id); app.appendVarchar(r.disposition); app.appendBoolean(r.qualified); app.endRow(); }
  app.closeSync();
  const ledger = (await (await con.runAndReadAll(`SELECT disposition, count(*) n FROM audit GROUP BY 1 ORDER BY n DESC`)).getRowObjects()).map((d) => ({ disposition: d.disposition, count: Number(d.n) }));
  const [{ total }] = (await (await con.runAndReadAll(`SELECT count(*) total FROM audit`)).getRowObjects());

  const payload = {
    classification: {
      naive_price_rent_overlap: Number(total),
      lineage_unverified: dispo.lineage_unverified || 0,
      quality_qualified: 0, // none pass the FULL contract from accessible data
      materialised_local: materialised.length,
      promotion_ready: 0,
    },
    disposition_ledger: ledger,
    source_provenance: provenance,
    note: "0 promotion-ready: the read-only warehouse contract exposes no upstream observation ids, actual sample sizes, or bedroom groups, and the medians are aggregate 'all' (registry permits gross_yield for house/unit only). The prior 'six materialised' were provisional candidates passing simplified snapshot gates — NOT lineage-qualified.",
  };
  const report = { generated_at: new Date().toISOString(), mode: APPLY ? "apply-local" : "read-only", reference_now: REFERENCE_NOW, endpoint, ...payload };

  console.log(`\nNSW yield LINEAGE AUDIT (${report.mode}) — reference ${REFERENCE_NOW}`);
  console.log(`naive price+rent overlap: ${Number(total)}  →  promotion-ready: 0  (materialised_local: ${materialised.length})`);
  console.log("disposition ledger:");
  for (const d of ledger) console.log(`  ${String(d.disposition).padEnd(24)} ${d.count}`);
  console.log("rent source provenance:", provenance?.rent_source, "| sales:", provenance?.sales_source);

  if (APPLY) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Content-addressed raw; reuse identical existing file (never overwrite/delete).
    const canonical = JSON.stringify(rows);
    const checksum = crypto.createHash("sha256").update(canonical).digest("hex");
    const existing = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : null;
    if (!existing || existing.sha256 !== checksum) {
      fs.writeFileSync(RAW_JSON, JSON.stringify(rows, null, 2));
      fs.writeFileSync(MANIFEST, JSON.stringify({ source: "propellect_warehouse:v_suburb_market_snapshot_v1", endpoint, retrieved_at: new Date().toISOString(), row_count: rows.length, sha256: checksum }, null, 2));
    }
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, "nsw_yield_lineage_audit.json"), JSON.stringify({ ...report, source_checksum: checksum }, null, 2));
    const csv = ["geography_code,geography_name,disposition,qualified,reasons"]
      .concat(results.map((r) => `${r.geography_code},"${r.geography_name}",${r.disposition},${r.qualified},"${r.reasons.join("; ")}"`)).join("\n");
    fs.writeFileSync(path.join(REPORT_DIR, "nsw_yield_disposition.csv"), csv);
    const md = [`# NSW yield lineage audit (${report.mode})`, "", `naive price+rent overlap: **${Number(total)}** → promotion-ready: **0**`, "",
      "| disposition | count |", "|---|--:|", ...ledger.map((d) => `| ${d.disposition} | ${d.count} |`), "",
      `Rent source: \`${provenance?.rent_source}\`; sales source: \`${provenance?.sales_source}\`.`,
      "", "The medians are aggregate `all` (registry permits gross_yield for house/unit only) and the read-only contract exposes no upstream observation ids / actual sample sizes / bedroom groups, so no candidate proves the full lineage contract."].join("\n");
    fs.writeFileSync(path.join(REPORT_DIR, "nsw_yield_lineage_audit.md"), md);
    console.log(`\nWrote lineage audit to ${REPORT_DIR}/ (local artifacts only).`);
  } else {
    console.log("\n[read-only] no filesystem writes. Pass --apply-local to persist the audit report.");
  }
}

main().catch((e) => {
  console.error("nsw yield lineage audit failed:", e.message);
  process.exit(1);
});
