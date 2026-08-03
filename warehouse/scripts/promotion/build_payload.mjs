#!/usr/bin/env node
/**
 * Merge the deterministic SA + VIC ingest payload parts into ONE canonical
 * promotion payload, verify the load invariants, compute the payload SHA-256,
 * and write a committed manifest (checksum + row counts by state/metric/status).
 *
 * The merged payload JSON itself stays under gitignored warehouse/data/local
 * (candidate bytes are never committed); only the manifest is committed.
 *
 * SAFETY: pure local file transform — no network, no DB, no remote write.
 *
 * Usage:
 *   node warehouse/scripts/promotion/build_payload.mjs \
 *     --sa   warehouse/data/local/v4a_payload/sa_payload.json \
 *     --vic  warehouse/data/local/v4a_payload/vic_payload.json \
 *     --out  warehouse/data/local/v4a_payload/merged_payload.json \
 *     --manifest warehouse/reports/v4a/validation_load_manifest.json
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ALLOWED_KEYS = new Set(["id", "src", "sha", "geo", "metric", "pt", "bg", "val", "unit", "n", "ps", "pe", "status", "formula", "price", "rent", "attr"]);
const GEO_RE = /^(SAL|POA)_\d+_ASGS3_2021$/;
const STATUSES = new Set(["direct", "derived", "contextual"]);
const PROP_TYPES = new Set(["house", "unit", "land", "all"]);
// Keys that would indicate property-level PII leaking into the aggregate payload.
const PII_MARKERS = /(address|street|unit_?no|lot|owner|name|lat|lon|geom|parcel|title|contact|email|phone)/i;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function fail(msg) {
  console.error(`FAIL CLOSED (build_payload): ${msg}`);
  process.exit(1);
}

function main() {
  const saPath = arg("--sa");
  const vicPath = arg("--vic");
  const outPath = arg("--out");
  const manifestPath = arg("--manifest");
  if (!saPath || !vicPath || !outPath || !manifestPath) fail("need --sa --vic --out --manifest");

  const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
  const vic = JSON.parse(fs.readFileSync(vicPath, "utf8"));
  if (sa.state !== "SA" || vic.state !== "VIC") fail("part state labels unexpected");
  if (sa.as_of !== vic.as_of) fail(`as-of mismatch SA=${sa.as_of} VIC=${vic.as_of}`);

  const tagged = [
    ...sa.rows.map((r) => ({ ...r, _state: "SA" })),
    ...vic.rows.map((r) => ({ ...r, _state: "VIC" })),
  ];

  // --- Invariant gate (fail closed) -------------------------------------------
  const seen = new Set();
  for (const r of tagged) {
    for (const k of Object.keys(r)) {
      if (k === "_state") continue;
      if (!ALLOWED_KEYS.has(k)) fail(`unexpected key '${k}' on ${r.id}`);
      if (PII_MARKERS.test(k)) fail(`PII-like key '${k}' on ${r.id}`);
    }
    if (!r.id || seen.has(r.id)) fail(`missing/duplicate id: ${r.id}`);
    seen.add(r.id);
    if (!(Number(r.val) > 0)) fail(`non-positive value on ${r.id}: ${r.val}`);
    if (!GEO_RE.test(r.geo)) fail(`bad geography id: ${r.geo}`);
    if (!STATUSES.has(r.status)) fail(`bad status: ${r.status} on ${r.id}`);
    if (!PROP_TYPES.has(r.pt)) fail(`bad property_type: ${r.pt} on ${r.id}`);
    if (!r.pe) fail(`missing period_end on ${r.id}`);
    if (r.status === "derived" && (!r.price || !r.rent)) fail(`derived row missing lineage: ${r.id}`);
  }
  // Derived lineage must resolve within the payload itself.
  for (const r of tagged) {
    if (r.status !== "derived") continue;
    if (!seen.has(r.price)) fail(`derived ${r.id} price lineage ${r.price} absent from payload`);
    if (!seen.has(r.rent)) fail(`derived ${r.id} rent lineage ${r.rent} absent from payload`);
  }

  // --- Canonical ordering + checksum ------------------------------------------
  // Sort by id (stable, deterministic); strip the internal _state tag from the
  // emitted rows. Checksum is over the canonical JSON of the ordered rows.
  const rows = [...tagged].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((r) => { const c = { ...r }; delete c._state; return c; });
  const canonical = JSON.stringify(rows);
  const sha256 = crypto.createHash("sha256").update(canonical).digest("hex");

  // --- Counts (by state / metric / status) ------------------------------------
  const tally = (key) => tagged.reduce((a, r) => ((a[r[key]] = (a[r[key]] || 0) + 1), a), {});
  const byStateMetric = {};
  for (const r of tagged) {
    const k = `${r._state}:${r.metric}:${r.pt}`;
    byStateMetric[k] = (byStateMetric[k] || 0) + 1;
  }
  const manifest = {
    generated_note: "Manifest for the SA+VIC official-metrics validation-branch load candidate. Payload bytes are NOT committed (gitignored); this checksum+counts pins the exact deterministic candidate.",
    as_of: sa.as_of,
    payload_sha256: sha256,
    total_rows: rows.length,
    by_state: tally("_state"),
    by_status: tally("status"),
    by_metric: tally("metric"),
    by_state_metric_type: byStateMetric,
    excluded: {
      price_growth_12m: "SIGNED metric (can be < 0) — incompatible with migration 056 value>0 invariant; deferred to a dedicated signed-metric lane. Not part of this load.",
    },
    sources: {
      SA: ["sa_metro_median_house_sales", "sa_private_rental_report"],
      VIC: ["vic_dffh_moving_annual_rent"],
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ as_of: sa.as_of, payload_sha256: sha256, rows }, null, 2));
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`payload rows: ${rows.length}  sha256: ${sha256}`);
  console.log(`by state: ${JSON.stringify(manifest.by_state)}  by status: ${JSON.stringify(manifest.by_status)}`);
  console.log(`by metric: ${JSON.stringify(manifest.by_metric)}`);
  console.log(`merged payload -> ${outPath} (gitignored)`);
  console.log(`manifest -> ${manifestPath} (committed)`);
}

main();
