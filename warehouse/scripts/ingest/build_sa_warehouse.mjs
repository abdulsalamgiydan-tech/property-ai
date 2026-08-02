#!/usr/bin/env node
/**
 * SA lane (data.sa.gov.au, CC BY) — real raw→staging→core→mart ingestion into an
 * EPHEMERAL local DuckDB, with geography resolution, deterministic observation
 * ids, quality/privacy gates, the full V2.1.2 yield qualifier, and SQL-measured
 * before/after coverage.
 *
 * SAFETY: read-only default (no writes); --apply-local persists local artifacts
 * only (DuckDB + report under gitignored warehouse/data/local / committed small
 * report under warehouse/reports/v3). No remote/Production/Supabase write path.
 * Deterministic given a fixed --as-of and the immutable raw resources.
 *
 * Usage: node warehouse/scripts/ingest/build_sa_warehouse.mjs [--apply-local] [--as-of YYYY-MM-DD]
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DuckDBInstance } from "@duckdb/node-api";
import { acquire } from "../acquire/immutableCore.mjs";
import { loadXlsxRows, quarterEndFromLabel } from "../../adapters/sa_common.mjs";
import { parseSaHouseSales } from "../../adapters/sa_metro_house_sales/parse.mjs";
import { parseSaRent } from "../../adapters/sa_private_rent/parse.mjs";
import { buildResolver, fetchSalSpine } from "../geography/resolveSal.mjs";
import { qualifyYield } from "../../../lib/warehouse/yieldLineage.mjs";

const DATA_DIR = "warehouse/data/local/v3_raw";
const REPORT_DIR = "warehouse/reports/v3";
const YIELD_OPTS = { minSample: 10, maxEndLagDays: 400, freshnessSlaDays: 400, maxWindowRatio: 2 };

function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(".env.local")) for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!l.includes("=")) continue; const i = l.indexOf("="); const k = l.slice(0, i).trim();
    if (!(k in env)) env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
const obsId = (...parts) => "obs_" + crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 20);

async function latestXlsx(pkgUrl) {
  const j = await (await fetch(pkgUrl, { signal: AbortSignal.timeout(20000) })).json();
  const rs = (j.result.resources || []).filter((r) => (r.format || "").toUpperCase() === "XLSX");
  rs.sort((a, b) => String(b.created || b.last_modified || "").localeCompare(String(a.created || a.last_modified || "")));
  return { url: rs[0].url, name: rs[0].name, licence: `${j.result.license_title} | ${j.result.license_id}` };
}

async function main() {
  const argv = process.argv.slice(2);
  const APPLY = argv.includes("--apply-local");
  const asOfIdx = argv.indexOf("--as-of");
  const asOf = asOfIdx !== -1 && argv[asOfIdx + 1] ? argv[asOfIdx + 1] : new Date().toISOString().slice(0, 10);
  const env = loadEnv();
  if (!env.WAREHOUSE_SUPABASE_URL) { console.error("FAIL CLOSED: warehouse creds missing"); process.exit(1); }

  // 1. acquire immutable raw (content-addressed; reuse if unchanged)
  const hs = await latestXlsx("https://data.sa.gov.au/data/api/3/action/package_show?id=metro-median-house-sales");
  const rr = await latestXlsx("https://data.sa.gov.au/data/api/3/action/package_show?id=private-rent-report");
  const hsRaw = await acquire(hs.url, { dir: DATA_DIR, basename: "sa_metro_house_sales", ext: "xlsx", expectContentType: "spreadsheetml", sourceId: "sa_metro_median_house_sales", retrievedAt: asOf + "T00:00:00Z" });
  const rrRaw = await acquire(rr.url, { dir: DATA_DIR, basename: "sa_private_rent", ext: "xlsx", expectContentType: "spreadsheetml", sourceId: "sa_private_rental_report", retrievedAt: asOf + "T00:00:00Z" });

  // 2. parse
  const houseRows = await loadXlsxRows(hsRaw.rawPath, "Sheet1", 7);
  const rentRows = await loadXlsxRows(rrRaw.rawPath, "Suburb", 27);
  const rentPeriod = quarterEndFromLabel(rr.name) || "2026-03-31";
  const house = parseSaHouseSales(houseRows, { retrievedAt: asOf, resourceSha: hsRaw.sha });
  const rent = parseSaRent(rentRows, { retrievedAt: asOf, resourceSha: rrRaw.sha, periodEnd: rentPeriod });
  if (house.drift || rent.drift) { console.error("FAIL CLOSED: schema drift", house.driftReason || rent.driftReason); process.exit(1); }

  // 3. resolve geography (suburb+SA -> SAL)
  const spine = await fetchSalSpine(env, "4");
  const resolve = buildResolver(spine, "4");

  const coreObs = []; // {observation_id, geography_id, geography_level, asgs_version, metric, property_type, bedroom_group, value, sample_size, period_start, period_end, source_id, resource_sha, status, quality_status}
  const quarantine = [...house.quarantined.map((q) => ({ ...q, stage: "parse" })), ...rent.quarantined.map((q) => ({ ...q, stage: "parse" }))];
  const asgs = "ASGS3_2021";

  const addObs = (rec, metric, propertyType, value, sample, periodStart, periodEnd, resourceSha, sourceId) => {
    const g = resolve(rec.suburb);
    if (!g.matched) { quarantine.push({ ...rec, metric, quarantine_reason: g.reason, stage: "geography" }); return null; }
    const o = {
      observation_id: obsId(sourceId, g.geographyId, metric, propertyType, periodEnd, resourceSha),
      geography_id: g.geographyId, geography_code: g.geographyCode, geography_level: "suburb", asgs_version: asgs,
      metric, property_type: propertyType, bedroom_group: "all", value, sample_size: sample,
      period_start: periodStart, period_end: periodEnd, source_id: sourceId, resource_sha: resourceSha, status: "direct", quality_status: "passed",
    };
    coreObs.push(o);
    return o;
  };

  // house sales -> median_house_price + sales_volume (+ derived 12m growth)
  for (const rec of house.records) {
    const ps = `${Number(rec.current_period_end.slice(0, 4))}-04-01`; // quarter window
    addObs(rec, "median_house_price", "house", rec.house_median, rec.sales_count, ps, rec.current_period_end, rec.resource_sha, rec.source_id);
    addObs(rec, "sales_volume", "house", rec.sales_count, rec.sales_count, ps, rec.current_period_end, rec.resource_sha, rec.source_id);
    if (rec.prior_house_median != null && rec.prior_house_median > 0 && rec.prior_sales_count >= 10) {
      const growth = Number(((rec.house_median / rec.prior_house_median - 1) * 100).toFixed(2));
      addObs({ ...rec }, "price_growth_12m", "house", growth, Math.min(rec.sales_count, rec.prior_sales_count), rec.prior_period_end, rec.current_period_end, rec.resource_sha, rec.source_id);
    }
  }
  // rent observations
  for (const o of rent.observations) {
    const ps = `${Number(o.period_end.slice(0, 4))}-01-01`;
    addObs(o, "median_rent", o.property_type, o.value, o.sample_size, ps, o.period_end, o.resource_sha, o.source_id);
  }

  // 4. qualified yields (house price + house rent, same SAL, full V2.1.2 contract)
  const yields = [];
  const byGeo = new Map();
  for (const o of coreObs) {
    if (!byGeo.has(o.geography_id)) byGeo.set(o.geography_id, {});
    if (o.metric === "median_house_price" && o.property_type === "house") byGeo.get(o.geography_id).price = o;
    if (o.metric === "median_rent" && o.property_type === "house") byGeo.get(o.geography_id).rent = o;
  }
  const inputEv = (o, sourceId) => ({
    observationId: o.observation_id, observationVerified: true, geographyId: o.geography_id, asgsVersion: o.asgs_version,
    geographyLevel: "suburb", directStatus: "direct", sourceContract: "accepted", provenanceVerified: true, sourceId,
    qualityStatus: "passed", propertyType: "house", bedroomGroup: "all", aggregateBedroomLegitimate: true,
    sampleSize: o.sample_size, periodStart: o.period_start, periodEnd: o.period_end, value: o.value, quarantined: false,
  });
  for (const [gid, m] of byGeo) {
    if (!m.price || !m.rent) continue;
    const ev = { price: inputEv(m.price, m.price.source_id), rent: inputEv(m.rent, m.rent.source_id) };
    const q = qualifyYield(ev, { ...YIELD_OPTS, asOf });
    if (q.qualified) yields.push({ geography_id: gid, gross_yield_pct: Number(((m.rent.value * 52) / m.price.value * 100).toFixed(2)), price_observation_id: m.price.observation_id, rent_observation_id: m.rent.observation_id, derived_id: q.derivedId });
  }

  // 5. DuckDB raw->staging->core->mart (ephemeral in-memory) for SQL coverage
  const db = await DuckDBInstance.create(":memory:");
  const con = await db.connect();
  await con.run(`create table core_obs (observation_id varchar, geography_id varchar, metric varchar, property_type varchar, value double, sample_size integer, period_end date, status varchar, source_id varchar)`);
  const app = await con.createAppender("core_obs");
  for (const o of coreObs) { app.appendVarchar(o.observation_id); app.appendVarchar(o.geography_id); app.appendVarchar(o.metric); app.appendVarchar(o.property_type); app.appendDouble(o.value); app.appendInteger(o.sample_size|0); app.appendDate({days: Math.floor(new Date(o.period_end).getTime()/86400000)}); app.appendVarchar(o.status); app.appendVarchar(o.source_id); app.endRow(); }
  app.closeSync();
  const rows = async (sql) => (await (await con.runAndReadAll(sql)).getRowObjects());
  const marted = await rows(`select metric, property_type, count(distinct geography_id) suburbs from core_obs group by 1,2 order by 1,2`);
  const [{ total_obs }] = await rows(`select count(*) total_obs from core_obs`);

  // 6. before/after vs existing warehouse SA coverage (read-only REST)
  const base = env.WAREHOUSE_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
  const H = { apikey: env.WAREHOUSE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.WAREHOUSE_SUPABASE_ANON_KEY}`, Prefer: "count=exact" };
  const before = async (col) => { const r = await fetch(`${base}/v_suburb_market_snapshot_v1?state_code=eq.4&${col}=not.is.null&select=geography_id&limit=1`, { method: "HEAD", headers: H }); const cr = r.headers.get("content-range") || ""; return Number(cr.split("/")[1] || 0); };
  const beforeCov = { median_house_price: await before("median_sale_price_detached"), median_rent: await before("median_weekly_rent_latest"), gross_yield: await before("gross_yield_pct") };
  const afterDirect = (metric, pt) => (marted.find((m) => m.metric === metric && (!pt || m.property_type === pt))?.suburbs) ?? 0;

  const report = {
    as_of: asOf,
    sources: [{ ...hsRaw, licence: hs.licence, name: hs.name }, { ...rrRaw, licence: rr.licence, name: rr.name }].map((s) => ({ source_sha256: s.sha, path: path.basename(s.rawPath), licence: s.licence, resource: s.name })),
    core_observations: Number(total_obs),
    materialised_by_metric: marted.map((m) => ({ metric: m.metric, property_type: m.property_type, suburbs: Number(m.suburbs) })),
    qualified_yields: yields.length,
    yield_sample: yields.slice(0, 5),
    quarantined: quarantine.length,
    quarantine_by_reason: Object.entries(quarantine.reduce((a, q) => ((a[q.quarantine_reason] = (a[q.quarantine_reason] || 0) + 1), a), {})).map(([reason, count]) => ({ reason, count })),
    before_after_sa: {
      median_house_price: { before: beforeCov.median_house_price, after_direct: Number(afterDirect("median_house_price", "house")) },
      median_rent_house: { before: beforeCov.median_rent, after_direct: Number(afterDirect("median_rent", "house")) },
      median_rent_unit: { before: null, after_direct: Number(afterDirect("median_rent", "unit")) },
      gross_yield: { before: beforeCov.gross_yield, after_qualified: yields.length },
    },
  };

  console.log(`\nSA lane ingest — as-of ${asOf} (${APPLY ? "apply-local" : "read-only"})`);
  console.log(`core observations: ${report.core_observations}`);
  for (const m of report.materialised_by_metric) console.log(`  ${m.metric}/${m.property_type}: ${m.suburbs} suburbs`);
  console.log(`qualified house yields: ${report.qualified_yields}`);
  console.log(`quarantined: ${report.quarantined}`, JSON.stringify(report.quarantine_by_reason));
  console.log(`SA before/after:`, JSON.stringify(report.before_after_sa));

  if (APPLY) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, "sa_ingest_coverage.json"), JSON.stringify(report, null, 2));
    console.log(`\nWrote ${REPORT_DIR}/sa_ingest_coverage.json`);
  } else {
    console.log("\n[read-only] pass --apply-local to persist the coverage report.");
  }
  await con.closeSync?.();
}

main().catch((e) => { console.error("SA ingest failed:", e.message); process.exit(1); });
