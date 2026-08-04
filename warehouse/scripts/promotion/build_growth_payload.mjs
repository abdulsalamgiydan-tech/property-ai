#!/usr/bin/env node
/**
 * Build the deterministic SIGNED price_growth_12m payload + committed manifest,
 * SEPARATE from the frozen 689-row payload (whose checksum cbd0b269… is never
 * touched). Verifies the metric-aware invariants of migration 058 (growth is a
 * signed percent bounded to [-100, 1000]; sign preserved), the direct source
 * provenance, and no PII-like fields; sorts by id; computes the SHA-256.
 *
 * The payload JSON stays gitignored under warehouse/data/local; only the manifest
 * (checksum + counts + observed min/max + unit + provenance) is committed.
 *
 * SAFETY: pure local file transform — no network, no DB, no remote write.
 *
 * Usage:
 *   node warehouse/scripts/promotion/build_growth_payload.mjs \
 *     --sa   warehouse/data/local/v5a_payload/sa_growth_payload.json \
 *     --out  warehouse/data/local/v5a_payload/signed_growth_payload.json \
 *     --manifest warehouse/reports/v5a/signed_growth_manifest.json
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ALLOWED_KEYS = new Set(["id", "src", "sha", "geo", "metric", "pt", "bg", "val", "unit", "n", "ps", "pe", "status", "formula", "price", "rent", "attr"]);
const GEO_RE = /^SAL_\d+_ASGS3_2021$/;
const PII_MARKERS = /(address|street|unit_?no|lot|owner|name|lat|lon|geom|parcel|title|contact|email|phone)/i;
const GROWTH_FLOOR = -100, GROWTH_CEIL = 1000;

const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null; };
function fail(m) { console.error(`FAIL CLOSED (build_growth_payload): ${m}`); process.exit(1); }

function main() {
  const saPath = arg("--sa"), outPath = arg("--out"), manifestPath = arg("--manifest");
  if (!saPath || !outPath || !manifestPath) fail("need --sa --out --manifest");
  const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
  if (sa.state !== "SA" || sa.metric !== "price_growth_12m") fail("unexpected growth part labels");

  const rows = sa.rows;
  if (!Array.isArray(rows) || rows.length === 0) fail("empty growth payload");
  const seen = new Set();
  let negatives = 0, zeros = 0; const vals = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!ALLOWED_KEYS.has(k)) fail(`unexpected key '${k}' on ${r.id}`);
      if (PII_MARKERS.test(k)) fail(`PII-like key '${k}' on ${r.id}`);
    }
    if (!r.id || seen.has(r.id)) fail(`missing/duplicate id: ${r.id}`);
    seen.add(r.id);
    if (r.metric !== "price_growth_12m") fail(`non-growth metric in growth payload: ${r.metric}`);
    if (r.unit !== "%") fail(`growth unit must be %, got ${r.unit} on ${r.id}`);
    if (r.status !== "direct") fail(`growth status must be direct (source-published), got ${r.status} on ${r.id}`);
    if (r.pt !== "house" || r.bg !== "all") fail(`growth must be house/all on ${r.id}`);
    if (typeof r.val !== "number" || !(r.val >= GROWTH_FLOOR && r.val <= GROWTH_CEIL)) fail(`growth out of bounds on ${r.id}: ${r.val}`);
    if (!GEO_RE.test(r.geo)) fail(`bad SA geography id: ${r.geo}`);
    if (!r.pe) fail(`missing period_end on ${r.id}`);
    vals.push(r.val);
    if (r.val < 0) negatives++; if (r.val === 0) zeros++;
  }

  const ordered = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const canonical = JSON.stringify(ordered);
  const sha256 = crypto.createHash("sha256").update(canonical).digest("hex");
  const min = Math.min(...vals), max = Math.max(...vals);

  const manifest = {
    generated_note: "Manifest for the SIGNED price_growth_12m payload (SA). Separate from the 689-row payload (cbd0b269…), which is unchanged. Sign preserved; bytes gitignored; this pins the exact candidate.",
    as_of: sa.as_of,
    metric: "price_growth_12m",
    unit: "%",
    provenance: sa.provenance,
    status: "direct",
    payload_sha256: sha256,
    total_rows: ordered.length,
    negatives, zeros, positives: ordered.length - negatives - zeros,
    observed_min: min, observed_max: max,
    bounds: { floor: GROWTH_FLOOR, ceil: GROWTH_CEIL },
    source: "sa_metro_median_house_sales (Median Change column)",
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ as_of: sa.as_of, metric: "price_growth_12m", payload_sha256: sha256, rows: ordered }, null, 2));
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`growth rows: ${ordered.length}  sha256: ${sha256}`);
  console.log(`negatives: ${negatives}  zeros: ${zeros}  min: ${min}  max: ${max}  (bounds ${GROWTH_FLOOR}..${GROWTH_CEIL})`);
  console.log(`payload -> ${outPath} (gitignored)`);
  console.log(`manifest -> ${manifestPath} (committed)`);
}
main();
