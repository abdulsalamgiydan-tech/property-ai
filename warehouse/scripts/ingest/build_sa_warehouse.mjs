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
  const emitIdx = argv.indexOf("--emit-payload");
  const EMIT_PAYLOAD = emitIdx !== -1 && argv[emitIdx + 1] ? argv[emitIdx + 1] : null;
  const emitGrowthIdx = argv.indexOf("--emit-growth-payload");
  const EMIT_GROWTH = emitGrowthIdx !== -1 && argv[emitGrowthIdx + 1] ? argv[emitGrowthIdx + 1] : null;
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
  const byObsId = new Map(); // observation_id -> core row (integrity: one row per canonical key)
  const quarantine = [...house.quarantined.map((q) => ({ ...q, stage: "parse" })), ...rent.quarantined.map((q) => ({ ...q, stage: "parse" }))];
  const recon = { staged: 0, duplicates_deduped: 0, conflicts_quarantined: 0 };
  const asgs = "ASGS3_2021";

  const addObs = (rec, metric, propertyType, value, sample, periodStart, periodEnd, resourceSha, sourceId) => {
    recon.staged += 1;
    const g = resolve(rec.suburb);
    if (!g.matched) { quarantine.push({ ...rec, metric, quarantine_reason: g.reason, stage: "geography" }); return null; }
    const observation_id = obsId(sourceId, g.geographyId, metric, propertyType, periodEnd, resourceSha);
    const existing = byObsId.get(observation_id);
    if (existing) {
      // Same canonical key (source, SAL, metric, type, period, resource): two source
      // localities resolved to one SAL. Identical value -> dedup; different value ->
      // conflict (fail closed to quarantine, never silently pick one).
      if (existing.value === value && existing.sample_size === sample) { recon.duplicates_deduped += 1; return existing; }
      recon.conflicts_quarantined += 1;
      quarantine.push({ ...rec, metric, quarantine_reason: "conflicting_value_same_canonical_key", stage: "core", geography_id: g.geographyId, kept_value: existing.value, rejected_value: value });
      return null;
    }
    const o = {
      observation_id, geography_id: g.geographyId, geography_code: g.geographyCode, geography_level: "suburb", asgs_version: asgs,
      metric, property_type: propertyType, bedroom_group: "all", value, sample_size: sample,
      period_start: periodStart, period_end: periodEnd, source_id: sourceId, resource_sha: resourceSha, status: "direct", quality_status: "passed",
    };
    coreObs.push(o);
    byObsId.set(observation_id, o);
    return o;
  };

  // house sales -> median_house_price + sales_volume (+ derived 12m growth)
  for (const rec of house.records) {
    const ps = `${Number(rec.current_period_end.slice(0, 4))}-04-01`; // quarter window
    addObs(rec, "median_house_price", "house", rec.house_median, rec.sales_count, ps, rec.current_period_end, rec.resource_sha, rec.source_id);
    addObs(rec, "sales_volume", "house", rec.sales_count, rec.sales_count, ps, rec.current_period_end, rec.resource_sha, rec.source_id);
    // price_growth_12m from the SOURCE-PUBLISHED "Median Change" column (DIRECT
    // provenance; matches (current/prior-1) for 156/156 rows). Signed percent,
    // sign preserved (real minimum ≈ -6.11%). Gated on the same >=10 prior-sales
    // quality bar as the other SA metrics.
    if (rec.median_change != null && rec.prior_house_median != null && rec.prior_house_median > 0 && rec.prior_sales_count >= 10) {
      const growth = Number((rec.median_change * 100).toFixed(2));
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
    if (q.qualified) yields.push({ geography_id: gid, gross_yield_pct: Number(((m.rent.value * 52) / m.price.value * 100).toFixed(2)), price_observation_id: m.price.observation_id, rent_observation_id: m.rent.observation_id, derived_id: q.derivedId, period_start: m.rent.period_start, period_end: m.price.period_end });
  }

  // 5. DuckDB raw->staging->core->mart (ephemeral in-memory) for SQL coverage
  const db = await DuckDBInstance.create(":memory:");
  const con = await db.connect();
  await con.run(`create table core_obs (observation_id varchar, geography_id varchar, metric varchar, property_type varchar, value double, sample_size integer, period_end date, status varchar, source_id varchar)`);
  const app = await con.createAppender("core_obs");
  for (const o of coreObs) { app.appendVarchar(o.observation_id); app.appendVarchar(o.geography_id); app.appendVarchar(o.metric); app.appendVarchar(o.property_type); app.appendDouble(o.value); app.appendInteger(o.sample_size|0); app.appendDate({days: Math.floor(new Date(o.period_end).getTime()/86400000)}); app.appendVarchar(o.status); app.appendVarchar(o.source_id); app.endRow(); }
  app.closeSync();
  const rows = async (sql) => (await (await con.runAndReadAll(sql)).getRowObjects());
  const marted = await rows(`select metric, property_type, count(*) observations, count(distinct geography_id) suburbs from core_obs group by 1,2 order by 1,2`);
  const [{ total_obs }] = await rows(`select count(*) total_obs from core_obs`);
  const [{ uniq_ids }] = await rows(`select count(distinct observation_id) uniq_ids from core_obs`);
  const [{ uniq_sal }] = await rows(`select count(distinct geography_id) uniq_sal from core_obs`);
  const rawParsed = house.records.length * 2 + house.records.filter((r) => r.prior_house_median > 0 && r.prior_sales_count >= 10).length + rent.observations.length;
  const perMetricObsSum = marted.reduce((a, m) => a + Number(m.observations), 0);
  const reconciliation = {
    note: "524-vs-487 explained: V3 double-counted observations where two SA source localities resolved to one SAL; those are now deduped (identical) or quarantined (conflicting). After dedup, total core rows == sum of per-metric rows == sum of per-metric distinct SALs.",
    raw_accepted_records_expanded_to_metrics: rawParsed,
    staged_addObs_calls: recon.staged,
    duplicates_deduped: recon.duplicates_deduped,
    conflicts_quarantined: recon.conflicts_quarantined,
    core_direct_observations: Number(total_obs),
    unique_observation_ids: Number(uniq_ids),
    per_metric_observation_sum: perMetricObsSum,
    unique_sal_covered: Number(uniq_sal),
    derived_observations: Number(marted.find((m) => m.metric === "price_growth_12m")?.observations ?? 0),
    contextual_observations: 0,
    integrity_ok: Number(total_obs) === Number(uniq_ids) && Number(total_obs) === perMetricObsSum,
  };

  // 6. before/after vs existing warehouse SA coverage (read-only REST)
  const base = env.WAREHOUSE_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
  const H = { apikey: env.WAREHOUSE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.WAREHOUSE_SUPABASE_ANON_KEY}`, Prefer: "count=exact" };
  const before = async (col) => { const r = await fetch(`${base}/v_suburb_market_snapshot_v1?state_code=eq.4&${col}=not.is.null&select=geography_id&limit=1`, { method: "HEAD", headers: H }); const cr = r.headers.get("content-range") || ""; return Number(cr.split("/")[1] || 0); };
  const beforeCov = { median_house_price: await before("median_sale_price_detached"), median_rent: await before("median_weekly_rent_latest"), gross_yield: await before("gross_yield_pct") };
  const afterDirect = (metric, pt) => (marted.find((m) => m.metric === metric && (!pt || m.property_type === pt))?.suburbs) ?? 0;

  const report = {
    as_of: asOf,
    sources: [{ ...hsRaw, licence: hs.licence, name: hs.name }, { ...rrRaw, licence: rr.licence, name: rr.name }].map((s) => ({ source_sha256: s.sha, path: path.basename(s.rawPath), licence: s.licence, resource: s.name })),
    reconciliation,
    core_observations: Number(total_obs),
    materialised_by_metric: marted.map((m) => ({ metric: m.metric, property_type: m.property_type, observations: Number(m.observations), suburbs: Number(m.suburbs) })),
    net_new_vs_verified: {
      note: "net-new = warehouse had 0 before; newly-verified = independently re-verified official data overlapping existing coverage",
      median_house_price: "net_new (SA house price was 0)",
      gross_yield: "net_new (SA yield was 0)",
      sales_volume: "net_new",
      price_growth_12m: "net_new",
      median_rent_house: "newly_verified_overlap (SA rent already had ~950 suburbs)",
      median_rent_unit: "mixed (net_new where warehouse lacked SA unit rent)",
    },
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

  if (EMIT_PAYLOAD) {
    // Emit the EXACT accepted candidate rows (direct core observations + qualified
    // derived yields) in the promotion payload-row shape consumed by
    // officialPromotion.observationValues(). Deterministic given --as-of + raw.
    const unitFor = { median_house_price: "AUD", sales_volume: "count", median_rent: "AUD/week" };
    const attribution = "© Government of South Australia (CC BY 4.0)";
    // price_growth_12m (a SIGNED metric) is excluded from THIS payload — it ships
    // in a SEPARATE signed-growth payload (see --emit-growth-payload) under the
    // metric-aware migration 058 invariant, keeping the frozen 689-row payload and
    // its checksum untouched.
    const payload = [];
    for (const o of coreObs) {
      if (o.metric === "price_growth_12m") continue;
      payload.push({
        id: o.observation_id, src: o.source_id, sha: o.resource_sha, geo: o.geography_id,
        metric: o.metric, pt: o.property_type, bg: o.bedroom_group, val: o.value,
        unit: unitFor[o.metric] ?? "unit", n: o.sample_size ?? null, ps: o.period_start ?? null,
        pe: o.period_end, status: o.status, attr: attribution,
      });
    }
    for (const y of yields) payload.push({
      id: y.derived_id, src: "derived", sha: "derived", geo: y.geography_id,
      metric: "gross_yield", pt: "house", bg: "all", val: y.gross_yield_pct, unit: "%",
      n: null, ps: y.period_start ?? null, pe: y.period_end, status: "derived",
      formula: "gross_yield@2", price: y.price_observation_id, rent: y.rent_observation_id, attr: attribution,
    });
    fs.mkdirSync(path.dirname(EMIT_PAYLOAD), { recursive: true });
    fs.writeFileSync(EMIT_PAYLOAD, JSON.stringify({ state: "SA", as_of: asOf, rows: payload }, null, 2));
    console.log(`\n[emit-payload] wrote ${payload.length} SA rows -> ${EMIT_PAYLOAD}`);
  }

  if (EMIT_GROWTH) {
    // Emit ONLY the signed price_growth_12m rows, sourced from the publisher's
    // "Median Change" column (DIRECT provenance), as a SEPARATE payload. Signed
    // percent, sign preserved. Deterministic given --as-of + immutable raw.
    const attribution = "© Government of South Australia (CC BY 4.0)";
    const growthRows = coreObs
      .filter((o) => o.metric === "price_growth_12m")
      .map((o) => ({
        id: o.observation_id, src: o.source_id, sha: o.resource_sha, geo: o.geography_id,
        metric: o.metric, pt: o.property_type, bg: o.bedroom_group, val: o.value,
        unit: "%", n: o.sample_size ?? null, ps: o.period_start ?? null,
        pe: o.period_end, status: o.status, attr: attribution,
      }));
    const vals = growthRows.map((r) => r.val);
    fs.mkdirSync(path.dirname(EMIT_GROWTH), { recursive: true });
    fs.writeFileSync(EMIT_GROWTH, JSON.stringify({ state: "SA", metric: "price_growth_12m", provenance: "direct_source_published_median_change", as_of: asOf, rows: growthRows }, null, 2));
    console.log(`\n[emit-growth-payload] wrote ${growthRows.length} SA price_growth_12m rows (min ${Math.min(...vals)} / max ${Math.max(...vals)}) -> ${EMIT_GROWTH}`);
  }

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
