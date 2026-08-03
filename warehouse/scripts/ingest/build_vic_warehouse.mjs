#!/usr/bin/env node
/**
 * VIC lane (discover.data.vic.gov.au CC BY → dffh.vic.gov.au) — real
 * raw→staging→core→mart ingestion of DFFH moving-annual median rent by suburb,
 * into an ephemeral local DuckDB. Reuses the SA immutable-acquisition + SAL
 * resolver + dedup/conflict pattern. Direct suburb rent by dwelling type +
 * bedroom group; combined provider localities and suppressed rows are honestly
 * quarantined. The land.vic median-house resource is 403 (recorded, not
 * circumvented) so VIC yields are NOT produced (no VIC house price).
 *
 * SAFETY: read-only default; --apply-local persists local report only; no
 * remote/Production/Supabase write. Deterministic given fixed --as-of + bytes.
 *
 * Usage: node warehouse/scripts/ingest/build_vic_warehouse.mjs [--apply-local] [--as-of YYYY-MM-DD]
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DuckDBInstance } from "@duckdb/node-api";
import { acquire } from "../acquire/immutableCore.mjs";
import { loadXlsxRows } from "../../adapters/sa_common.mjs";
import { parseVicRent, SHEET_MAP } from "../../adapters/vic_rental_report/parse.mjs";
import { buildResolver, fetchSalSpine } from "../geography/resolveSal.mjs";

const DATA_DIR = "warehouse/data/local/v3_raw";
const REPORT_DIR = "warehouse/reports/v4a";
const ALLOWED_HOSTS = new Set(["www.dffh.vic.gov.au", "dffh.vic.gov.au"]);

function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(".env.local")) for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!l.includes("=")) continue; const i = l.indexOf("="); const k = l.slice(0, i).trim();
    if (!(k in env)) env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
const obsId = (...p) => "obs_" + crypto.createHash("sha256").update(p.join("|")).digest("hex").slice(0, 20);

// Deterministic reporting-period rank from a resource name (CKAN `created` is
// unreliable — a 2022 resource can be catalogued after a 2025 one). Returns a
// sortable YYYYMM or -1.
function periodRank(name) {
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, march: 3, june: 6, september: 9, december: 12 };
  const m = String(name).match(/(jan|feb|mar|march|apr|may|jun|june|jul|aug|sep|sept|september|oct|nov|dec|december)\w*\s+(?:quarter\s+)?(\d{4})/i);
  if (!m) return -1;
  return Number(m[2]) * 100 + (MON[m[1].toLowerCase()] || 0);
}

async function latestVicRentResource() {
  const j = await (await fetch("https://discover.data.vic.gov.au/api/3/action/package_show?id=rental-report-quarterly-moving-annual-rents-by-suburb", { signal: AbortSignal.timeout(20000) })).json();
  // Filter on the URL's `suburb` marker (catalogue NAMES are inconsistently
  // labelled "by LGA" even for suburb resources); rank by reporting period from
  // whichever of url/name carries it.
  const rs = (j.result.resources || [])
    .filter((r) => (r.format || "").toUpperCase() === "XLSX" && /rent-?s?-suburb/i.test(r.url || "") && /-excel$/.test(r.url || ""))
    .map((r) => ({ ...r, _rank: Math.max(periodRank(r.url.replace(/-/g, " ")), periodRank(r.name)) }))
    .filter((r) => r._rank > 0)
    .sort((a, b) => b._rank - a._rank); // latest REPORTING PERIOD, not latest `created`
  if (!rs.length) throw new Error("no VIC suburb rent resource with a parseable reporting period");
  return { url: rs[0].url, name: rs[0].name, period_rank: rs[0]._rank, licence: `${j.result.license_title} | ${j.result.license_id}` };
}

async function main() {
  const argv = process.argv.slice(2);
  const APPLY = argv.includes("--apply-local");
  const i = argv.indexOf("--as-of");
  const asOf = i !== -1 && argv[i + 1] ? argv[i + 1] : new Date().toISOString().slice(0, 10);
  const emitIdx = argv.indexOf("--emit-payload");
  const EMIT_PAYLOAD = emitIdx !== -1 && argv[emitIdx + 1] ? argv[emitIdx + 1] : null;
  const env = loadEnv();
  if (!env.WAREHOUSE_SUPABASE_URL) { console.error("FAIL CLOSED: warehouse creds missing"); process.exit(1); }

  // 1. discover + follow the documented redirect to the real dffh file (validate final host)
  const res = await latestVicRentResource();
  const head = await fetch(res.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(30000) });
  const finalHost = new URL(head.url).host;
  if (!ALLOWED_HOSTS.has(finalHost)) { console.error(`FAIL CLOSED: redirect left the official allowlist -> ${finalHost}`); process.exit(1); }
  const raw = await acquire(head.url, { dir: DATA_DIR, basename: "vic_rent", ext: "xlsx", expectContentType: "spreadsheetml", sourceId: "vic_dffh_moving_annual_rent", retrievedAt: asOf + "T00:00:00Z", maxBytes: 20 * 1024 * 1024 });

  // 2. parse every mapped sheet
  const spine = await fetchSalSpine(env, "2");
  const resolve = buildResolver(spine, "2");
  const coreObs = [];
  const byObsId = new Map();
  const quarantine = [];
  const recon = { staged: 0, duplicates_deduped: 0, conflicts_quarantined: 0 };
  for (const sheetName of Object.keys(SHEET_MAP)) {
    const rows = await loadXlsxRows(raw.rawPath, sheetName, 340);
    const p = parseVicRent(rows, { retrievedAt: asOf, resourceSha: raw.sha, sheetName });
    if (p.drift) { console.error("FAIL CLOSED: VIC schema drift", sheetName, p.driftReason); process.exit(1); }
    quarantine.push(...p.quarantined.map((q) => ({ ...q, stage: "parse", sheet: sheetName })));
    for (const o of p.observations) {
      recon.staged += 1;
      const g = resolve(o.suburb);
      if (!g.matched) { quarantine.push({ ...o, quarantine_reason: g.reason, stage: "geography" }); continue; }
      const oid = obsId(o.source_id, g.geographyId, o.metric, o.property_type, o.bedroom_group, o.period_end, raw.sha);
      const existing = byObsId.get(oid);
      if (existing) { if (existing.value === o.value) { recon.duplicates_deduped += 1; } else { recon.conflicts_quarantined += 1; quarantine.push({ ...o, quarantine_reason: "conflicting_value_same_canonical_key", stage: "core" }); } continue; }
      const row = { observation_id: oid, geography_id: g.geographyId, metric: o.metric, property_type: o.property_type, bedroom_group: o.bedroom_group, value: o.value, sample_size: o.sample_size, period_end: o.period_end, status: "direct", source_id: o.source_id };
      coreObs.push(row); byObsId.set(oid, row);
    }
  }

  // 3. DuckDB coverage
  const db = await DuckDBInstance.create(":memory:");
  const con = await db.connect();
  await con.run(`create table core_obs (observation_id varchar, geography_id varchar, metric varchar, property_type varchar, bedroom_group varchar, value double, sample_size integer, period_end date)`);
  const app = await con.createAppender("core_obs");
  for (const o of coreObs) { app.appendVarchar(o.observation_id); app.appendVarchar(o.geography_id); app.appendVarchar(o.metric); app.appendVarchar(o.property_type); app.appendVarchar(o.bedroom_group); app.appendDouble(o.value); app.appendInteger(o.sample_size | 0); app.appendDate({ days: Math.floor(new Date(o.period_end).getTime() / 86400000) }); app.endRow(); }
  app.closeSync();
  const rows = async (sql) => (await (await con.runAndReadAll(sql)).getRowObjects());
  const byType = await rows(`select property_type, bedroom_group, count(*) observations, count(distinct geography_id) suburbs from core_obs group by 1,2 order by 1,2`);
  const [{ total }] = await rows(`select count(*) total from core_obs`);
  const [{ uniq_sal }] = await rows(`select count(distinct geography_id) uniq_sal from core_obs`);

  // before/after vs existing warehouse VIC rent
  const base = env.WAREHOUSE_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
  const H = { apikey: env.WAREHOUSE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.WAREHOUSE_SUPABASE_ANON_KEY}`, Prefer: "count=exact" };
  const beforeRent = await (async () => { const r = await fetch(`${base}/v_suburb_market_snapshot_v1?state_code=eq.2&median_weekly_rent_latest=not.is.null&select=geography_id&limit=1`, { method: "HEAD", headers: H }); const cr = r.headers.get("content-range") || ""; return Number(cr.split("/")[1] || 0); })();

  const report = {
    as_of: asOf,
    source: { source_sha256: raw.sha, path: path.basename(raw.rawPath), licence: res.licence, resource: res.name, final_host: finalHost },
    reconciliation: { staged: recon.staged, duplicates_deduped: recon.duplicates_deduped, conflicts_quarantined: recon.conflicts_quarantined, core_direct_observations: Number(total), unique_sal_covered: Number(uniq_sal), integrity_ok: Number(total) === byObsId.size },
    core_observations: Number(total),
    by_property_bedroom: byType.map((m) => ({ property_type: m.property_type, bedroom_group: m.bedroom_group, observations: Number(m.observations), suburbs: Number(m.suburbs) })),
    quarantined: quarantine.length,
    quarantine_by_reason: Object.entries(quarantine.reduce((a, q) => ((a[q.quarantine_reason] = (a[q.quarantine_reason] || 0) + 1), a), {})).map(([reason, count]) => ({ reason, count })),
    before_after_vic: { median_rent_direct_suburbs: { before_warehouse_any_rent: beforeRent, after_new_bedroom_specific_obs: Number(total), after_unique_suburbs: Number(uniq_sal) } },
    notes: { vic_house_price: "land.vic.gov.au median-house .xls returns HTTP 403 (access control) — recorded, not circumvented; no VIC house price → no VIC yield", combined_localities: "combined provider localities (e.g. 'Albert Park-Middle Park-West St Kilda') resolve to no single SAL and are quarantined as geography_unmatched" },
  };

  console.log(`\nVIC lane ingest — as-of ${asOf} (${APPLY ? "apply-local" : "read-only"})`);
  console.log(`source: ${res.name} (${res.licence}) sha=${raw.sha.slice(0, 8)} host=${finalHost}`);
  console.log(`core observations: ${report.core_observations}  unique VIC suburbs: ${report.reconciliation.unique_sal_covered}`);
  for (const m of report.by_property_bedroom) console.log(`  ${m.property_type}/${m.bedroom_group}br: ${m.suburbs} suburbs`);
  console.log(`quarantined: ${report.quarantined}`, JSON.stringify(report.quarantine_by_reason));

  if (EMIT_PAYLOAD) {
    // Emit the EXACT accepted VIC candidate rows (direct bedroom-specific suburb
    // rent) in the promotion payload-row shape. Deterministic given --as-of + raw.
    const attribution = "© State of Victoria (DFFH) (CC BY 4.0)";
    const payload = coreObs.map((o) => ({
      id: o.observation_id, src: o.source_id, sha: raw.sha, geo: o.geography_id,
      metric: o.metric, pt: o.property_type, bg: o.bedroom_group, val: o.value,
      unit: "AUD/week", n: o.sample_size ?? null, ps: null, pe: o.period_end,
      status: o.status, attr: attribution,
    }));
    fs.mkdirSync(path.dirname(EMIT_PAYLOAD), { recursive: true });
    fs.writeFileSync(EMIT_PAYLOAD, JSON.stringify({ state: "VIC", as_of: asOf, rows: payload }, null, 2));
    console.log(`\n[emit-payload] wrote ${payload.length} VIC rows -> ${EMIT_PAYLOAD}`);
  }

  if (APPLY) { fs.mkdirSync(REPORT_DIR, { recursive: true }); fs.writeFileSync(path.join(REPORT_DIR, "vic_ingest_coverage.json"), JSON.stringify(report, null, 2)); console.log(`\nWrote ${REPORT_DIR}/vic_ingest_coverage.json`); }
  else console.log("\n[read-only] pass --apply-local to persist the report.");
  await con.closeSync?.();
}
main().catch((e) => { console.error("VIC ingest failed:", e.message); process.exit(1); });
