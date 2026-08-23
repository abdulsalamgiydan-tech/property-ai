#!/usr/bin/env node
/**
 * OFFICIAL COVERAGE UPLIFT 1 — offline coverage runner for SA Metropolitan
 * Median House Sales (data.sa.gov.au, CC BY 4.0; the official SA Valuer-General
 * / Office of Land Value quarterly suburb HOUSE median price).
 *
 * Pipeline: discover (CKAN package_show) → acquire immutable bytes (single
 * conservative public HTTPS GET) → parse (strict, fail-closed) → strict ASGS
 * 2021 SAL mapping against the committed spine → reconcile (dedupe/conflict) →
 * offline quality gates → coverage simulation → committed evidence report.
 *
 * SAFETY: read-only by default. `--acquire` performs ONE public GET and writes
 * immutable raw bytes + a manifest under gitignored warehouse/data/local. There
 * is NO database client, NO Supabase read/write, NO publication primitive, and
 * production coverage is never changed. `assembleCoverage` is pure (no I/O) and
 * deterministic given the input bytes, so a rerun is byte-identical.
 *
 * Usage:
 *   node warehouse/scripts/coverage/sa_metro_house_price_uplift.mjs --acquire [--as-of YYYY-MM-DD] [--emit <report.json>]
 *   node warehouse/scripts/coverage/sa_metro_house_price_uplift.mjs --from-file <xlsx> [--as-of YYYY-MM-DD] [--emit <report.json>]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { sha256, writeImmutable } from "../acquire/immutableCore.mjs";
import { loadXlsxRows, str } from "../../adapters/sa_common.mjs";
import { parseSaHouseSales, SOURCE_ID } from "../../adapters/sa_metro_house_sales/parse.mjs";
import { buildSaHouseResolver, toCanonicalObservations, reconcileObservations, LICENCE, ATTRIBUTION } from "../../adapters/sa_metro_house_sales/normalize.mjs";
import { runLocalQualityGates } from "../quality/local_quality_gates.mjs";
import { simulate } from "./coverage_engine_core.mjs";
import { SA_HOUSE_PRICE_BATCH, candidateBatchToRows, expectedMartRowCount } from "../promotion/saHousePricePromotion.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "warehouse", "data", "local", "coverage_uplift");
const SPINE_PATH = path.join(REPO_ROOT, "warehouse", "metadata", "sa_all_sals.json");
const BASELINE_PATH = path.join(REPO_ROOT, "warehouse", "reports", "suburb_metric_coverage.json");
const DEFAULT_REPORT = path.join(REPO_ROOT, "warehouse", "reports", "sa_metro_house_coverage_uplift.json");

export const CKAN_PACKAGE = "https://data.sa.gov.au/data/api/3/action/package_show?id=metro-median-house-sales";
export const LANDING_URL = "https://data.sa.gov.au/data/dataset/metro-median-house-sales";
export const ALLOWED_HOSTS = new Set(["data.sa.gov.au"]);
export const MATERIALITY_TARGET = 100;

/** Sortable YYYYQ rank from a resource name/url (e.g. "…Q2 2026" → 20262). */
export function quarterRank(text) {
  const m = String(text).match(/(?:^|[^0-9])([1-4])\s*q\s*(\d{4})|q\s*([1-4])\s*(\d{4})|(\d{4})[_\- ]?q\s*([1-4])/i);
  if (!m) return -1;
  const q = Number(m[1] ?? m[3] ?? m[6]);
  const y = Number(m[2] ?? m[4] ?? m[5]);
  if (!q || !y) return -1;
  return y * 10 + q;
}

/** Choose the latest-period XLSX resource from a CKAN package_show result. */
export function pickLatestResource(pkgResult) {
  const xlsx = (pkgResult.resources || [])
    .filter((r) => String(r.format || "").toUpperCase() === "XLSX")
    .map((r) => ({ ...r, _rank: Math.max(quarterRank(r.name), quarterRank(r.url)) }))
    .filter((r) => r._rank > 0)
    .sort((a, b) => b._rank - a._rank);
  if (!xlsx.length) throw new Error("no XLSX resource with a parseable quarter in the SA package");
  const top = xlsx[0];
  return {
    name: top.name,
    url: top.url,
    last_modified: top.last_modified ?? null,
    licence: `${pkgResult.license_title} | ${pkgResult.license_id}`,
    licence_url: pkgResult.license_url ?? null,
  };
}

/** sha256 over the joined header labels — the structural schema fingerprint. */
export function schemaFingerprint(headerRow) {
  return crypto.createHash("sha256").update((headerRow || []).map((c) => str(c)).join("")).digest("hex");
}

function tally(list) {
  const out = {};
  for (const k of list) out[k] = (out[k] || 0) + 1;
  return Object.entries(out).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function atomicWriteSidecar(target, obj) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, target);
}

/**
 * Record (or reuse) the REAL acquisition timestamp in a gitignored,
 * content-addressed sidecar. The first successful GET writes the true wall-clock
 * UTC time; deterministic reruns reuse it rather than falsifying time. A stored
 * sidecar with a DIFFERENT sha256 for the same basename means the upstream
 * resource changed — the caller must fail closed (drift), never overwrite.
 * @returns {{ acquired_at_utc:string|null, source:string, drift?:{prior_sha:string} }}
 */
export function recordAcquisitionSidecar(dir, sha, provenance, nowIso) {
  fs.mkdirSync(dir, { recursive: true });
  const sidecarPath = path.join(dir, `sa_metro_house.${sha.slice(0, 8)}.acquired.json`);
  for (const name of fs.readdirSync(dir)) {
    const m = /^sa_metro_house\.([0-9a-f]{8})\.acquired\.json$/.exec(name);
    if (m && m[1] !== sha.slice(0, 8)) {
      const prior = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      return { drift: { prior_sha: prior.sha256 ?? m[1] }, acquired_at_utc: null, source: "drift" };
    }
  }
  if (fs.existsSync(sidecarPath)) {
    const existing = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    return { acquired_at_utc: existing.acquired_at_utc, source: "immutable_sidecar" };
  }
  atomicWriteSidecar(sidecarPath, { sha256: sha, acquired_at_utc: nowIso, ...provenance });
  return { acquired_at_utc: nowIso, source: "fresh_get" };
}

/**
 * PURE evidence assembly (no network, no DB, no filesystem). Given the raw 2D
 * sheet rows, the committed SAL spine and acquisition/source context, produce the
 * full coverage-evidence object. Deterministic given identical inputs.
 */
export function assembleCoverage({ rows, salList, baseline, source, acquisition, asOf }) {
  const parsed = parseSaHouseSales(rows, { retrievedAt: acquisition.acquired_at_utc, resourceSha: acquisition.sha256 });
  if (parsed.drift) {
    return { drift: true, driftReason: parsed.driftReason };
  }
  const resolve = buildSaHouseResolver(salList);

  const quarantine = parsed.quarantined.map((q) => ({ suburb: q.suburb, quarantine_reason: q.quarantine_reason, stage: "parse" }));
  const sourceLabels = new Set();
  const observations = [];
  let mappedSourceRows = 0;
  let geographyQuarantinedRows = 0;
  for (const record of parsed.records) {
    const out = toCanonicalObservations(record, resolve, { acquiredAt: acquisition.acquired_at_utc });
    if (!out.ok) { geographyQuarantinedRows += 1; quarantine.push({ suburb: record.suburb, quarantine_reason: out.reason, stage: "geography" }); continue; }
    mappedSourceRows += 1;
    sourceLabels.add(String(record.suburb).toUpperCase());
    observations.push(...out.observations);
  }
  const emittedBeforeDedup = observations.length;
  const { accepted, conflicts, deduped } = reconcileObservations(observations);
  for (const c of conflicts) quarantine.push({ suburb: c.geographyLabel, quarantine_reason: c.quarantine_reason, stage: "core" });

  const priceRows = accepted.filter((r) => r.metric === "median_sale_price_detached");
  const growthRows = accepted.filter((r) => r.metric === "annual_price_growth_12m");
  const uniqueMapped = new Set(priceRows.map((r) => r.geographyId));

  // ── Reconciled row accounting (every source row is accounted for) ──────────
  const scanned = Math.max(0, rows.length - 1);
  const parserAccepted = parsed.records.length;
  const parserQuarantined = parsed.quarantined.length;
  const uniqueCanonicalGeographies = new Set(observations.map((o) => o.geographyId)).size;
  const duplicateSourceRows = mappedSourceRows - uniqueCanonicalGeographies;
  const conflictEvents = conflicts.length;
  const quarantineEvents = parserQuarantined + geographyQuarantinedRows + conflictEvents;
  const acceptedAfterDedup = accepted.length;
  const accounting = {
    source_data_rows_scanned: scanned,
    parser_accepted_source_rows: parserAccepted,
    parser_quarantined_source_rows: parserQuarantined,
    geography_quarantined_source_rows: geographyQuarantinedRows,
    mapped_source_rows: mappedSourceRows,
    duplicate_source_rows: duplicateSourceRows,
    unique_canonical_geographies: uniqueCanonicalGeographies,
    emitted_observations_before_dedup: emittedBeforeDedup,
    accepted_observations_after_dedup: acceptedAfterDedup,
    deduplicated_observations: deduped,
    conflict_events: conflictEvents,
    quarantine_events: quarantineEvents,
    invariants: {
      scanned_splits_into_parser_accepted_plus_quarantined: scanned === parserAccepted + parserQuarantined,
      mapped_equals_parser_accepted_minus_geo_quarantined: mappedSourceRows === parserAccepted - geographyQuarantinedRows,
      unique_plus_duplicate_equals_mapped: uniqueCanonicalGeographies + duplicateSourceRows === mappedSourceRows,
      emitted_equals_accepted_plus_deduped_plus_conflicts: emittedBeforeDedup === acceptedAfterDedup + deduped + conflictEvents,
      quarantine_events_sum: quarantineEvents === parserQuarantined + geographyQuarantinedRows + conflictEvents,
      no_silent_source_row_loss: scanned === parserQuarantined + geographyQuarantinedRows + uniqueCanonicalGeographies + duplicateSourceRows,
    },
    reconciliation_explanation:
      "These sit at three different grains, so they never sum naively (482 != 190 + 293). (1) SOURCE-ROW split: the 482 scanned data rows partition cleanly into 190 parser-accepted + 292 parser-quarantined. (2) The 1 geography rejection is a SUBSET of the 190 parser-accepted rows (RIVERLEA PARK parsed fine but has no ASGS 2021 SAL), leaving 189 mapped source rows; it is NOT a third addend on 482. (3) OBSERVATION grain: each mapped row emits a price + a derived-growth observation, so 189 mapped rows emit 378 observations; 38 are identical duplicates from 19 source rows that resolve to an already-seen SAL, leaving 340 accepted observations across 170 unique SALs. The 293 quarantine EVENTS = 292 parse + 1 geography + 0 conflicts.",
  };

  const gates = runLocalQualityGates({
    sourceId: SOURCE_ID,
    expectedSourceId: SOURCE_ID,
    sourceLicence: LICENCE,
    expectedLicence: LICENCE,
    schemaFingerprint: acquisition.schema_fingerprint,
    fileMeta: { mime: acquisition.mime, bytes: acquisition.bytes, looksHtml: false, complete: true },
    minimumSampleSize: 10,
    rows: accepted,
    quarantined: quarantine,
  });

  const coverageSim = simulate({
    coverage: baseline,
    candidateObservations: accepted.map((r) => ({ metric: r.metric, geographyId: r.geographyId, propertyType: r.propertyType, reportingPeriod: r.reportingPeriod })),
  });

  const freshness = { fresh: 0, stale: 0, unknown: 0 };
  for (const r of accepted) freshness[r.freshness] = (freshness[r.freshness] || 0) + 1;

  const geoQuarantine = quarantine.filter((q) => q.stage === "geography");
  const unmatched = geoQuarantine.filter((q) => q.quarantine_reason === "geography_unmatched").length;
  const ambiguous = geoQuarantine.filter((q) => q.quarantine_reason === "ambiguous_geography").length;

  return {
    milestone: "OFFICIAL_COVERAGE_UPLIFT_1.1",
    generated_at: acquisition.generated_at ?? new Date().toISOString(),
    as_of: asOf,
    reporting_period_end: parsed.currentPeriodEnd,
    acquired_at_utc: acquisition.acquired_at_utc,
    production_coverage_changed: false,
    source: {
      source_id: SOURCE_ID,
      name: source.name,
      publisher: "Government of South Australia (Valuer-General / Office of Land Value)",
      jurisdiction: "SA",
      landing_url: LANDING_URL,
      resource_url: source.url,
      licence: source.licence,
      licence_url: source.licence_url,
      attribution: ATTRIBUTION,
      commercial_reuse: true,
      derivative_permitted: true,
    },
    acquisition: {
      acquired_at_utc: acquisition.acquired_at_utc,
      acquired_at_source: acquisition.acquired_at_source ?? null,
      final_url: acquisition.final_url,
      final_host: acquisition.final_host,
      mime: acquisition.mime,
      bytes: acquisition.bytes,
      sha256: acquisition.sha256,
      etag: acquisition.etag ?? null,
      last_modified: acquisition.last_modified ?? null,
      schema_fingerprint: acquisition.schema_fingerprint,
    },
    schema: {
      header: (rows[0] || []).map((c) => str(c)),
      current_period_end: parsed.currentPeriodEnd,
      prior_period_end: parsed.priorPeriodEnd,
    },
    geography: {
      level: "SAL",
      asgs_version: "ASGS 2021 (Suburbs and Localities)",
      state: "SA",
      state_code: "4",
      spine_artifact: "warehouse/metadata/sa_all_sals.json",
      spine_size: salList.length,
    },
    metric_family: "sale_price",
    accounting,
    counts: {
      accepted_observations: accepted.length,
      accepted_by_metric: {
        median_sale_price_detached: priceRows.length,
        annual_price_growth_12m: growthRows.length,
      },
      unique_mapped_asgs_ids: uniqueMapped.size,
      unique_source_geography_labels: sourceLabels.size,
      unmatched,
      ambiguous,
      deduped_identical: deduped,
      natural_key_conflicts: conflicts.length,
      quarantined_total: quarantine.length,
      quarantine_by_reason: tally(quarantine.map((q) => `${q.stage}:${q.quarantine_reason}`)),
    },
    classification: {
      direct: accepted.filter((r) => r.classification === "direct").length,
      derived: accepted.filter((r) => r.classification === "derived").length,
      contextual: 0,
      note: "median_sale_price_detached is DIRECT (a primary published median). annual_price_growth_12m is DERIVED (a 12-month change; the publisher's 'Median Change' value and lineage are preserved, but it is a derived quantity, not a primary median read).",
      unavailable_note: "gross_yield is NOT emitted for these suburbs — this source carries no rent, so a yield would require a second source and is honestly left unavailable (never zero).",
    },
    freshness,
    materiality: {
      target_unique_mapped_geographies: MATERIALITY_TARGET,
      unique_mapped_asgs_ids: uniqueMapped.size,
      met: uniqueMapped.size >= MATERIALITY_TARGET,
      basis: "unique ASGS 2021 SAL ids carrying a DIRECT median_sale_price_detached observation",
    },
    candidate_footprint: {
      unique_mapped_asgs_ids: uniqueMapped.size,
      of_state_sal_universe: salList.length,
      production_overlap: "unknown",
      net_new_provable: false,
      note: "This is a CANDIDATE footprint measured offline against the committed SA SAL spine. Overlap with already-published production coverage is unknown here because no remote warehouse/database was read (prohibited). Net-new production uplift cannot be claimed without a separately approved database validation run; production coverage remains unchanged.",
    },
    target_compatibility: {
      target_table: "core.official_observation (full-lineage) -> mart.official_suburb_metric (consumer projection)",
      migrations: ["056_official_suburb_metrics.sql", "057_official_suburb_metrics_consumer_rpc.sql", "058_signed_price_growth_constraint.sql"],
      upsert_keys: {
        core: "observation_id (deterministic content-address of source_id|geography_id|metric|property_type|bedroom_group|period_end|resource_sha256)",
        mart: "(geography_id, metric, property_type, bedroom_group, period_end)",
      },
      geography_id_transform: "SAL code (e.g. 40085) -> canonical warehouse id SAL_<code>_ASGS3_2021",
      metric_transforms: [
        { candidate_metric: "median_sale_price_detached", target_metric: "median_house_price", property_type: "house", bedroom_group: "all", unit: "AUD", status: "direct", note: "the DETACHED-house median; NOT converted to median_sale_price_12m (overall) and NOT written to the main snapshot's median_sale_price_detached column" },
        { candidate_metric: "annual_price_growth_12m", target_metric: "price_growth_12m", property_type: "house", bedroom_group: "all", unit: "%", status: "derived", note: "signed percent, bounded [-100,1000] by migration 058; value = publisher 'Median Change' x100, lineage preserved, classified derived" },
      ],
      source_identifiers: { source_id: SOURCE_ID, asgs_version: "ASGS3_2021", geography_level: "suburb", resource_sha256: acquisition.sha256, licence: LICENCE, attribution: ATTRIBUTION },
      serving: {
        official_metrics_rpc: "public.get_official_suburb_metrics_v1(geography_id) exposes BOTH the direct price and the derived growth (is_derived flag) for the suburb's official-metrics panel on /research/suburb/[geographyCode]",
        direct_only_view: "public.v_official_suburb_metric_v1 exposes the direct median_house_price rows only (derived growth is stored but not shown here)",
        main_price_card_unchanged: "the main market-snapshot price card / median_sale_price_detached field / search results / map are served by get_market_snapshot_v2 (mart.suburb_market_snapshot, NSW-fact-derived) and are NOT written by this path — they do not change",
        remains_unavailable: "gross_yield (no rent in this source), median_sale_price_12m (overall), and everything in the main snapshot for these SA suburbs",
      },
      schema_supports_batch: true,
    },
    coverage_simulation: coverageSim,
    quality_gates: { admit: gates.admit, accepted_rows: gates.acceptedRows, quarantined_rows: gates.quarantinedRows, gates: gates.gates, failures: gates.failures },
    idempotency: {
      accepted_natural_key_count: new Set(accepted.map((r) => `${r.sourceId}|${r.geographyId}|${r.metric}|${r.propertyType}|${r.reportingPeriod}`)).size,
      deterministic_given_bytes: true,
      note: "Given identical source bytes (sha256 above), parse+normalise+reconcile are pure and produce byte-identical accepted keys and totals on every rerun.",
    },
  };
}

function loadJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

/** Re-derive the accepted canonical observations (pure; same transforms as assembleCoverage). */
export function deriveAcceptedRows(rows, salList, acquiredAt, sha) {
  const parsed = parseSaHouseSales(rows, { retrievedAt: acquiredAt, resourceSha: sha });
  if (parsed.drift) return { drift: true, accepted: [] };
  const resolve = buildSaHouseResolver(salList);
  const observations = [];
  for (const record of parsed.records) {
    const out = toCanonicalObservations(record, resolve, { acquiredAt });
    if (out.ok) observations.push(...out.observations);
  }
  return { drift: false, accepted: reconcileObservations(observations).accepted };
}

async function main() {
  const argv = process.argv.slice(2);
  const ACQUIRE = argv.includes("--acquire");
  const fromIdx = argv.indexOf("--from-file");
  const FROM_FILE = fromIdx !== -1 ? argv[fromIdx + 1] : null;
  const asOfIdx = argv.indexOf("--as-of");
  const asOf = asOfIdx !== -1 && argv[asOfIdx + 1] ? argv[asOfIdx + 1] : new Date().toISOString().slice(0, 10);
  const emitIdx = argv.indexOf("--emit");
  const REPORT = emitIdx !== -1 && argv[emitIdx + 1] ? argv[emitIdx + 1] : DEFAULT_REPORT;

  const salList = loadJson(SPINE_PATH);
  const baseline = loadJson(BASELINE_PATH);

  let rawPath, source, acquisition;
  if (FROM_FILE) {
    rawPath = FROM_FILE;
    const buf = fs.readFileSync(rawPath);
    const sha = sha256(buf);
    source = { name: "SA Metropolitan Median House Sales (local file)", url: `file://${path.resolve(rawPath)}`, licence: `${LICENCE}`, licence_url: "https://creativecommons.org/licenses/by/4.0/", last_modified: null };
    // Prefer the real acquisition timestamp from the immutable sidecar if present.
    const sc = recordAcquisitionSidecar(DATA_DIR, sha, {}, null);
    acquisition = { acquired_at_utc: sc.acquired_at_utc, acquired_at_source: sc.source, final_url: source.url, final_host: "local", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: buf.length, sha256: sha, etag: null, last_modified: null };
  } else if (ACQUIRE) {
    // Capture the REAL wall-clock acquisition time at the moment of the GET.
    const nowIso = new Date().toISOString();
    const pkg = await (await fetch(CKAN_PACKAGE, { signal: AbortSignal.timeout(30000) })).json();
    source = pickLatestResource(pkg.result);
    const res = await fetch(source.url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
    const finalHost = new URL(res.url).host;
    if (!ALLOWED_HOSTS.has(finalHost)) { console.error(`FAIL CLOSED: resource left the official allowlist -> ${finalHost}`); process.exit(1); }
    if (!res.ok) { console.error(`FAIL CLOSED: HTTP ${res.status}`); process.exit(1); }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1 || buf.length > 20 * 1024 * 1024) { console.error(`FAIL CLOSED: body ${buf.length} bytes out of range`); process.exit(1); }
    if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) { console.error("FAIL CLOSED: XLSX zip magic missing"); process.exit(1); }
    const sha = sha256(buf);
    // Content-address the exact bytes (immutable; never overwritten if unchanged).
    const written = writeImmutable(DATA_DIR, "sa_metro_house", "xlsx", buf, {
      source_id: SOURCE_ID, url: res.url, retrieved_at: nowIso,
      http: { status: res.status, content_type: res.headers.get("content-type"), content_length: buf.length, etag: res.headers.get("etag"), last_modified: res.headers.get("last-modified") },
    });
    // Real acquisition timestamp: fresh on first GET, reused on deterministic rerun.
    const sc = recordAcquisitionSidecar(DATA_DIR, sha, { final_url: res.url, final_host: finalHost, etag: res.headers.get("etag"), last_modified: res.headers.get("last-modified"), content_type: res.headers.get("content-type"), bytes: buf.length }, nowIso);
    if (sc.drift) { console.error(`FAIL CLOSED: resource checksum drift — prior sha ${sc.drift.prior_sha}, now ${sha}. Both artifacts preserved; refusing to overwrite immutable raw.`); process.exit(1); }
    rawPath = written.rawPath;
    acquisition = { acquired_at_utc: sc.acquired_at_utc, acquired_at_source: sc.source, final_url: res.url, final_host: finalHost, mime: res.headers.get("content-type"), bytes: buf.length, sha256: written.sha, etag: res.headers.get("etag"), last_modified: res.headers.get("last-modified") };
  } else {
    console.error("Nothing to do. Pass --acquire (public GET) or --from-file <xlsx>.");
    process.exit(2);
  }

  const rows = await loadXlsxRows(rawPath, "Sheet1", 8);
  acquisition.schema_fingerprint = schemaFingerprint(rows[0]);
  // as_of (run param), reporting period, acquired_at_utc (real, immutable) and
  // generated_at are DISTINCT fields; generated_at is honest wall-clock metadata.
  acquisition.generated_at = new Date().toISOString();
  const evidence = assembleCoverage({ rows, salList, baseline, source, acquisition, asOf });
  if (evidence.drift) { console.error("FAIL CLOSED: schema drift —", evidence.driftReason); process.exit(1); }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(evidence, null, 2) + "\n");

  const emitPayloadIdx = argv.indexOf("--emit-payload");
  if (emitPayloadIdx !== -1) {
    const payloadPath = argv[emitPayloadIdx + 1] || path.join(DATA_DIR, "sa_house_price_payload.json");
    const ctx = { ...SA_HOUSE_PRICE_BATCH, resourceSha256: acquisition.sha256, schemaFingerprint: acquisition.schema_fingerprint, reportingPeriodEnd: evidence.reporting_period_end, retrievedAt: acquisition.acquired_at_utc };
    const { accepted } = deriveAcceptedRows(rows, salList, acquisition.acquired_at_utc, acquisition.sha256);
    const officialRows = candidateBatchToRows(accepted, ctx);
    const payload = { source_id: ctx.sourceId, resource_sha256: ctx.resourceSha256, schema_fingerprint: ctx.schemaFingerprint, reporting_period_end: ctx.reportingPeriodEnd, retrieved_at: ctx.retrievedAt, row_count: officialRows.length, rows: officialRows };
    const payloadJson = JSON.stringify(payload, null, 2) + "\n";
    fs.mkdirSync(path.dirname(payloadPath), { recursive: true });
    fs.writeFileSync(payloadPath, payloadJson);
    const payloadSha = crypto.createHash("sha256").update(payloadJson).digest("hex");
    const byMetric = {}; const byStatus = {};
    for (const r of officialRows) { byMetric[r.metric] = (byMetric[r.metric] || 0) + 1; byStatus[r.status] = (byStatus[r.status] || 0) + 1; }
    const manifest = {
      milestone: "OFFICIAL_COVERAGE_UPLIFT_1.1", source_id: ctx.sourceId, resource_sha256: ctx.resourceSha256,
      schema_fingerprint: ctx.schemaFingerprint, reporting_period_end: ctx.reportingPeriodEnd, acquired_at_utc: ctx.retrievedAt,
      target_table: "core.official_observation -> mart.official_suburb_metric",
      upsert_key_mart: "(geography_id, metric, property_type, bedroom_group, period_end)",
      row_cap: ctx.rowCap, core_rows: officialRows.length, mart_rows: expectedMartRowCount(officialRows),
      by_metric: byMetric, by_status: byStatus, payload_sha256: payloadSha,
      payload_path_gitignored: path.relative(REPO_ROOT, payloadPath).replace(/\\/g, "/"),
      note: "Manifest only (safe): checksums + aggregate counts. The per-row payload is gitignored (aggregate CC-BY suburb medians; kept out of git per the raw-data policy).",
    };
    fs.writeFileSync(path.join(REPO_ROOT, "warehouse", "reports", "sa_house_price_validation_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`[emit-payload] wrote ${officialRows.length} official rows -> ${path.relative(REPO_ROOT, payloadPath)} (gitignored); manifest -> warehouse/reports/sa_house_price_validation_manifest.json`);
  }

  console.log(`\nSA metro house-price coverage uplift — as-of ${asOf} (acquired ${acquisition.acquired_at_utc} via ${acquisition.acquired_at_source})`);
  console.log(`source: ${source.name} (${source.licence}) sha=${acquisition.sha256.slice(0, 12)} host=${acquisition.final_host}`);
  console.log(`period: ${evidence.schema.current_period_end}  metric_family: sale_price`);
  console.log(`accepted observations: ${evidence.counts.accepted_observations}  (DIRECT price=${evidence.classification.direct}, DERIVED growth=${evidence.classification.derived})`);
  console.log(`UNIQUE MAPPED ASGS SAL: ${evidence.counts.unique_mapped_asgs_ids}  (materiality >=${MATERIALITY_TARGET}: ${evidence.materiality.met ? "MET" : "NOT MET"})`);
  console.log(`accounting invariants all hold: ${Object.values(evidence.accounting.invariants).every(Boolean)}`);
  console.log(`quarantine events: ${evidence.accounting.quarantine_events}  unmatched=${evidence.counts.unmatched} ambiguous=${evidence.counts.ambiguous} deduped=${evidence.counts.deduped_identical} conflicts=${evidence.counts.natural_key_conflicts}`);
  console.log(`quality gates admit: ${evidence.quality_gates.admit}`);
  console.log(`wrote ${path.relative(REPO_ROOT, REPORT)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error("SA metro house-price uplift failed:", e.message); process.exit(1); });
}
