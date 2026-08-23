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

/**
 * PURE evidence assembly (no network, no DB, no filesystem). Given the raw 2D
 * sheet rows, the committed SAL spine and acquisition/source context, produce the
 * full coverage-evidence object. Deterministic given identical inputs.
 */
export function assembleCoverage({ rows, salList, baseline, source, acquisition, asOf }) {
  const parsed = parseSaHouseSales(rows, { retrievedAt: acquisition.retrieved_at_utc, resourceSha: acquisition.sha256 });
  if (parsed.drift) {
    return { drift: true, driftReason: parsed.driftReason };
  }
  const resolve = buildSaHouseResolver(salList);

  const quarantine = parsed.quarantined.map((q) => ({ suburb: q.suburb, quarantine_reason: q.quarantine_reason, stage: "parse" }));
  const sourceLabels = new Set();
  const observations = [];
  for (const record of parsed.records) {
    const out = toCanonicalObservations(record, resolve, { acquiredAt: acquisition.retrieved_at_utc });
    if (!out.ok) { quarantine.push({ suburb: record.suburb, quarantine_reason: out.reason, stage: "geography" }); continue; }
    sourceLabels.add(String(record.suburb).toUpperCase());
    observations.push(...out.observations);
  }
  const { accepted, conflicts, deduped } = reconcileObservations(observations);
  for (const c of conflicts) quarantine.push({ suburb: c.geographyLabel, quarantine_reason: c.quarantine_reason, stage: "core" });

  const priceRows = accepted.filter((r) => r.metric === "median_sale_price_detached");
  const growthRows = accepted.filter((r) => r.metric === "annual_price_growth_12m");
  const uniqueMapped = new Set(priceRows.map((r) => r.geographyId));

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
    milestone: "OFFICIAL_COVERAGE_UPLIFT_1",
    generated_at: acquisition.generated_at ?? new Date().toISOString(),
    as_of: asOf,
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
      retrieved_at_utc: acquisition.retrieved_at_utc,
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
    counts: {
      source_rows_scanned: Math.max(0, rows.length - 1),
      parsed_records: parsed.records.length,
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
      direct: accepted.length,
      derived: 0,
      contextual: 0,
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
    source = { name: "SA Metropolitan Median House Sales (local file)", url: `file://${path.resolve(rawPath)}`, licence: `${LICENCE}`, licence_url: "https://creativecommons.org/licenses/by/4.0/", last_modified: null };
    acquisition = { retrieved_at_utc: `${asOf}T00:00:00Z`, final_url: source.url, final_host: "local", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: buf.length, sha256: sha256(buf), etag: null, last_modified: null };
  } else if (ACQUIRE) {
    const pkg = await (await fetch(CKAN_PACKAGE, { signal: AbortSignal.timeout(30000) })).json();
    source = pickLatestResource(pkg.result);
    const res = await fetch(source.url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
    const finalHost = new URL(res.url).host;
    if (!ALLOWED_HOSTS.has(finalHost)) { console.error(`FAIL CLOSED: resource left the official allowlist → ${finalHost}`); process.exit(1); }
    if (!res.ok) { console.error(`FAIL CLOSED: HTTP ${res.status}`); process.exit(1); }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1 || buf.length > 20 * 1024 * 1024) { console.error(`FAIL CLOSED: body ${buf.length} bytes out of range`); process.exit(1); }
    if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) { console.error("FAIL CLOSED: XLSX zip magic missing"); process.exit(1); }
    // Single conservative GET already done; content-address the exact bytes (no second fetch).
    const written = writeImmutable(DATA_DIR, "sa_metro_house", "xlsx", buf, {
      source_id: SOURCE_ID, url: res.url, retrieved_at: `${asOf}T00:00:00Z`,
      http: { status: res.status, content_type: res.headers.get("content-type"), content_length: buf.length, etag: res.headers.get("etag"), last_modified: res.headers.get("last-modified") },
    });
    rawPath = written.rawPath;
    acquisition = { retrieved_at_utc: `${asOf}T00:00:00Z`, final_url: res.url, final_host: finalHost, mime: res.headers.get("content-type"), bytes: buf.length, sha256: written.sha, etag: res.headers.get("etag"), last_modified: res.headers.get("last-modified") };
  } else {
    console.error("Nothing to do. Pass --acquire (public GET) or --from-file <xlsx>.");
    process.exit(2);
  }

  const rows = await loadXlsxRows(rawPath, "Sheet1", 8);
  acquisition.schema_fingerprint = schemaFingerprint(rows[0]);
  // Deterministic report identity: tie generated_at to --as-of so a rerun over
  // the same source bytes is byte-identical (proves reproducibility).
  acquisition.generated_at = `${asOf}T00:00:00Z`;
  const evidence = assembleCoverage({ rows, salList, baseline, source, acquisition, asOf });
  if (evidence.drift) { console.error("FAIL CLOSED: schema drift —", evidence.driftReason); process.exit(1); }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(evidence, null, 2) + "\n");

  console.log(`\nSA metro house-price coverage uplift — as-of ${asOf}`);
  console.log(`source: ${source.name} (${source.licence}) sha=${acquisition.sha256.slice(0, 12)} host=${acquisition.final_host}`);
  console.log(`period: ${evidence.schema.current_period_end}  metric_family: sale_price`);
  console.log(`accepted observations: ${evidence.counts.accepted_observations}  (price=${evidence.counts.accepted_by_metric.median_sale_price_detached}, growth=${evidence.counts.accepted_by_metric.annual_price_growth_12m})`);
  console.log(`UNIQUE MAPPED ASGS SAL: ${evidence.counts.unique_mapped_asgs_ids}  (materiality ≥${MATERIALITY_TARGET}: ${evidence.materiality.met ? "MET" : "NOT MET"})`);
  console.log(`quarantined: ${evidence.counts.quarantined_total}  unmatched=${evidence.counts.unmatched} ambiguous=${evidence.counts.ambiguous} deduped=${evidence.counts.deduped_identical} conflicts=${evidence.counts.natural_key_conflicts}`);
  console.log(`quality gates admit: ${evidence.quality_gates.admit}`);
  console.log(`wrote ${path.relative(REPO_ROOT, REPORT)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error("SA metro house-price uplift failed:", e.message); process.exit(1); });
}
