#!/usr/bin/env node
/**
 * NSW suburb gross-yield LINEAGE AUDIT (V2.1.1) — canonical, honest, safe.
 *
 * Uses the ONE canonical qualifier (lib/warehouse/yieldLineage.mjs) — the same
 * implementation the unit tests run; there is NO duplicated logic here.
 *
 * The read-only warehouse contract exposes no upstream observation ids, actual
 * sample sizes, bedroom groups, or independent per-input provenance, and the
 * medians are aggregate 'all'. This script does NOT fabricate that evidence: it
 * builds honest per-input evidence (missing fields null / provenance
 * unverified), so every candidate is `lineage_unverified` and the promotion-
 * ready count computes to ZERO. All report totals are engine-derived and
 * asserted to reconcile.
 *
 * SAFETY: default mode is READ-ONLY (zero filesystem mutations). --apply-local
 * writes content-addressed, immutable raw + per-resource manifests via atomic
 * temp-file rename, preserving prior resources; retrieval is validated before
 * use and a failed fetch never overwrites the last valid artifact. ISO dates
 * only. No remote/Production/Supabase write path.
 *
 * Usage: node warehouse/scripts/coverage/materialise_nsw_yield.mjs [--apply-local] [--as-of YYYY-MM-DD]
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "url";
import { qualifyYield } from "../../../lib/warehouse/yieldLineage.mjs";

export { qualifyYield }; // re-export the SAME canonical qualifier (parity-tested)

const DATA_DIR = "warehouse/data/local";
const REPORT_DIR = "warehouse/reports/coverage_v2";
const OPTS_BASE = { minSample: 10, maxEndLagDays: 400, freshnessSlaDays: 400, maxWindowRatio: 2 };
const REQUIRED_COLUMNS = ["geography_id", "median_sale_price_12m", "median_weekly_rent_latest", "latest_sales_period", "latest_rent_period"];

export function loadEnv() {
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

/** Validate an HTTP response body BEFORE use. Returns {ok, rows?, reason?}. Fails closed. */
export function validateRetrieval(res, text) {
  if (!res || !res.ok) return { ok: false, reason: `HTTP ${res ? res.status : "no-response"}` };
  const ct = (res.headers?.get?.("content-type") || res.contentType || "").toLowerCase();
  if (!ct.includes("application/json")) return { ok: false, reason: `unexpected content-type '${ct}'` };
  let body;
  try { body = JSON.parse(text); } catch { return { ok: false, reason: "body is not valid JSON" }; }
  if (!Array.isArray(body)) {
    const kind = body && (body.message || body.code || body.error) ? "error object masquerading as data" : "not an array";
    return { ok: false, reason: kind };
  }
  if (body.length < 1 || body.length > 100000) return { ok: false, reason: `row count ${body.length} outside bounds [1,100000]` };
  const first = body[0];
  const missing = REQUIRED_COLUMNS.filter((c) => !(c in first));
  if (missing.length) return { ok: false, reason: `schema drift: missing columns ${missing.join(", ")}` };
  if (typeof first.median_sale_price_12m !== "number" || typeof first.median_weekly_rent_latest !== "number") {
    return { ok: false, reason: "schema drift: price/rent are not numbers" };
  }
  return { ok: true, rows: body };
}

function asgsVersionOf(gid) {
  const m = String(gid).match(/(ASGS\d+_\d{4})$/);
  return m ? m[1] : null;
}

/**
 * Honest per-input evidence from the snapshot. Upstream observation ids, sample
 * sizes, bedroom groups and independent provenance are NOT exposed by the read-
 * only contract, so they are null / provenanceVerified=false — never fabricated
 * and never generalised from one candidate. The one snapshot `direct_or_derived`
 * flag is NOT treated as independent proof of either input's direct status.
 */
export function evidenceFor(c) {
  const gid = c.geography_id;
  const common = {
    observationId: null, geographyId: gid, asgsVersion: asgsVersionOf(gid),
    geographyLevel: "suburb", directStatus: null, sourceContract: null,
    provenanceVerified: false, qualityStatus: null, bedroomGroup: null,
    aggregateBedroomLegitimate: false, sampleSize: null, quarantined: false,
    periodStart: null,
  };
  return {
    price: { ...common, propertyType: "all", periodEnd: c.latest_sales_period, sourceId: "nsw_vg_sales", value: c.median_sale_price_12m },
    rent: { ...common, propertyType: "all", periodEnd: c.latest_rent_period, sourceId: "nsw_dcj_rent_and_sales_report", value: c.median_weekly_rent_latest },
  };
}

/** All report totals are derived from the qualification results (no hard-coded zeros). */
export function buildTotals(results) {
  const ledger = {};
  for (const r of results) ledger[r.disposition] = (ledger[r.disposition] || 0) + 1;
  const qualified = results.filter((r) => r.qualified).length;
  const promotion_ready = results.filter((r) => r.qualified && r.disposition === "materialised_local").length;
  const totals = {
    naive_price_rent_overlap: results.length,
    lineage_unverified: ledger.lineage_unverified || 0,
    materialised_local: qualified,
    promotion_ready,
    disposition_ledger: Object.entries(ledger).map(([disposition, count]) => ({ disposition, count })).sort((a, b) => b.count - a.count),
  };
  // Reconciliation assertions.
  const sum = totals.disposition_ledger.reduce((a, d) => a + d.count, 0);
  if (sum !== totals.naive_price_rent_overlap) throw new Error(`ledger ${sum} != naive ${totals.naive_price_rent_overlap}`);
  if (qualified !== totals.materialised_local) throw new Error("qualified != materialised_local");
  if (promotion_ready !== qualified) throw new Error("promotion_ready != qualified");
  return totals;
}

/** Atomic write: temp file then rename. A failure to write the temp leaves the target untouched. */
export function atomicWrite(target, content) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, target);
}

/** Content-addressed immutable raw: filename carries the sha8; identical existing file is reused; never overwrites a different resource. */
export function writeImmutableRaw(rows, endpoint, dataDir = DATA_DIR) {
  const canonical = JSON.stringify(rows);
  const sha = crypto.createHash("sha256").update(canonical).digest("hex");
  const sha8 = sha.slice(0, 8);
  fs.mkdirSync(dataDir, { recursive: true });
  const rawPath = path.join(dataDir, `nsw_yield_candidates.${sha8}.json`);
  const manPath = path.join(dataDir, `nsw_yield_candidates.${sha8}.manifest.json`);
  if (!fs.existsSync(rawPath)) atomicWrite(rawPath, JSON.stringify(rows, null, 2));
  if (!fs.existsSync(manPath)) {
    atomicWrite(manPath, JSON.stringify({ source: "propellect_warehouse:v_suburb_market_snapshot_v1", endpoint, row_count: rows.length, sha256: sha }, null, 2));
  }
  return { sha, sha8, rawPath, manPath };
}

async function main() {
  const argv = process.argv.slice(2);
  const APPLY = argv.includes("--apply-local");
  const asOfIdx = argv.indexOf("--as-of");
  const asOf = asOfIdx !== -1 && argv[asOfIdx + 1] ? argv[asOfIdx + 1] : new Date().toISOString().slice(0, 10);
  const opts = { ...OPTS_BASE, asOf };

  const env = loadEnv();
  if (!env.WAREHOUSE_SUPABASE_URL || !env.WAREHOUSE_SUPABASE_ANON_KEY) { console.error("FAIL CLOSED: warehouse read-only creds not configured."); process.exit(1); }
  const base = env.WAREHOUSE_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
  const H = { apikey: env.WAREHOUSE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.WAREHOUSE_SUPABASE_ANON_KEY}` };
  const cols = "geography_id,geography_code,geography_name,state_code,median_sale_price_12m,median_weekly_rent_latest,latest_sales_period,latest_rent_period,sales_sample_confidence,rent_confidence,direct_or_derived,snapshot_generated_at";
  const endpoint = `${base}/v_suburb_market_snapshot_v1?median_sale_price_12m=not.is.null&median_weekly_rent_latest=not.is.null&gross_yield_pct=is.null&state_code=eq.1&select=${cols}&order=geography_id`;

  const res = await fetch(endpoint, { headers: H });
  const text = await res.text();
  const validated = validateRetrieval(res, text);
  if (!validated.ok) { console.error(`FAIL CLOSED: retrieval invalid — ${validated.reason}. Last valid artifact/report left untouched.`); process.exit(1); }
  const rows = validated.rows;

  const results = rows.map((c) => {
    const q = qualifyYield(evidenceFor(c), opts);
    return { geography_id: c.geography_id, geography_code: c.geography_code, geography_name: c.geography_name, disposition: q.disposition, qualified: q.qualified, reasons: q.reasons };
  });
  const totals = buildTotals(results);

  // Deterministic evidence vs volatile run metadata kept separate.
  const deterministic = { as_of: asOf, endpoint, ...totals };
  const runMeta = { generated_at: new Date().toISOString(), mode: APPLY ? "apply-local" : "read-only" };

  console.log(`\nNSW yield LINEAGE AUDIT (${runMeta.mode}) — as-of ${asOf}`);
  console.log(`naive price+rent overlap: ${totals.naive_price_rent_overlap}  →  promotion-ready: ${totals.promotion_ready}  (materialised_local: ${totals.materialised_local})`);
  for (const d of totals.disposition_ledger) console.log(`  ${String(d.disposition).padEnd(24)} ${d.count}`);

  if (APPLY) {
    const raw = writeImmutableRaw(rows, endpoint);
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    atomicWrite(path.join(REPORT_DIR, "nsw_yield_lineage_audit.json"), JSON.stringify({ deterministic: { ...deterministic, source_sha256: raw.sha }, run: runMeta }, null, 2));
    const csv = ["geography_code,geography_name,disposition,qualified"].concat(results.map((r) => `${r.geography_code},"${r.geography_name}",${r.disposition},${r.qualified}`)).join("\n");
    atomicWrite(path.join(REPORT_DIR, "nsw_yield_disposition.csv"), csv);
    const md = [`# NSW yield lineage audit`, "", `as-of ${asOf} · naive **${totals.naive_price_rent_overlap}** → promotion-ready **${totals.promotion_ready}**`, "", "| disposition | count |", "|---|--:|", ...totals.disposition_ledger.map((d) => `| ${d.disposition} | ${d.count} |`), "", "The read-only warehouse contract exposes no upstream observation ids / actual sample sizes / bedroom groups and the medians are aggregate `all`, so no candidate proves the full lineage contract."].join("\n");
    atomicWrite(path.join(REPORT_DIR, "nsw_yield_lineage_audit.md"), md);
    console.log(`\nWrote immutable raw ${raw.rawPath} + audit to ${REPORT_DIR}/ (local artifacts only).`);
  } else {
    console.log("\n[read-only] no filesystem writes. Pass --apply-local to persist immutable raw + audit.");
  }
}

// Only run when executed directly — importing this module (for tests) must not fetch.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => { console.error("nsw yield lineage audit failed:", e.message); process.exit(1); });
}
