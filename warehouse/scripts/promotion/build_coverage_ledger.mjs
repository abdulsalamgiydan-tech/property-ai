#!/usr/bin/env node
/**
 * Build the national state × metric × property-type coverage-gap ledger for the
 * official-source lanes. Covered cells are counted from the EXACT pinned payload
 * (SA + VIC); gap cells carry an honest, specific reason (no fabricated coverage).
 * NSW remains BLOCKED (VG PSI 403; no CC-BY residential-sales bulk on data.nsw).
 *
 * SAFETY: local file transform only — no network, no DB.
 *
 * Usage:
 *   node warehouse/scripts/promotion/build_coverage_ledger.mjs \
 *     --payload warehouse/data/local/v4a_payload/merged_payload.json \
 *     --out-json warehouse/reports/v4a/coverage_gap_ledger.json \
 *     --out-md   warehouse/reports/v4a/coverage_gap_ledger.md
 */
import fs from "fs";
import path from "path";

const arg = (name, def) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const PAYLOAD_PATH = arg("--payload", "warehouse/data/local/v4a_payload/merged_payload.json");
const OUT_JSON = arg("--out-json", "warehouse/reports/v4a/coverage_gap_ledger.json");
const OUT_MD = arg("--out-md", "warehouse/reports/v4a/coverage_gap_ledger.md");

// Canonical cells the national warehouse tracks per state.
const CELLS = [
  ["median_house_price", "house"],
  ["median_rent", "house"],
  ["median_rent", "unit"],
  ["sales_volume", "house"],
  ["gross_yield", "house"],
];
const STATES = ["SA", "VIC", "NSW"];
// SAL numeric prefix per state (ASGS3): SA=4xxxx, VIC=2xxxx, NSW=1xxxx (used inline below).
// Honest gap reasons for cells with no accepted CC-BY source this release.
const GAP_REASON = {
  "VIC|median_house_price|house": "No accepted CC-BY VIC house-price source: land.vic.gov.au median-house .xls returns HTTP 403 (recorded, not circumvented).",
  "VIC|sales_volume|house": "No accepted CC-BY VIC sales-volume source in this release (DFFH suburb file is rent only).",
  "VIC|gross_yield|house": "Derived yield requires a direct VIC house price, which is absent (see VIC house-price gap) — no yield produced.",
  "NSW|median_house_price|house": "BLOCKED: NSW VG PSI weekly/annual sales return HTTP 403; no CC-BY residential-sales bulk on data.nsw.gov.au.",
  "NSW|median_rent|house": "BLOCKED: no accepted CC-BY NSW suburb rent source onboarded this release.",
  "NSW|median_rent|unit": "BLOCKED: no accepted CC-BY NSW suburb rent source onboarded this release.",
  "NSW|sales_volume|house": "BLOCKED: depends on the same NSW VG PSI sales feed (HTTP 403).",
  "NSW|gross_yield|house": "BLOCKED: no NSW price or rent inputs accepted — no yield produced.",
};

function main() {
  const payload = JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8"));
  const rows = payload.rows;
  // suburb count per (state, metric, property_type)
  const key = (s, m, p) => `${s}|${m}|${p}`;
  const suburbs = new Map(); // key -> Set(geo)
  for (const r of rows) {
    const state = r.geo.startsWith("SAL_4") ? "SA" : r.geo.startsWith("SAL_2") ? "VIC" : r.geo.startsWith("SAL_1") ? "NSW" : "OTHER";
    const k = key(state, r.metric, r.pt);
    if (!suburbs.has(k)) suburbs.set(k, new Set());
    suburbs.get(k).add(r.geo);
  }

  const matrix = [];
  for (const state of STATES) {
    for (const [metric, pt] of CELLS) {
      const k = key(state, metric, pt);
      const count = suburbs.get(k)?.size ?? 0;
      const covered = count > 0;
      matrix.push({
        state, metric, property_type: pt,
        status: covered ? "covered" : (state === "NSW" ? "blocked" : "gap"),
        suburb_count: count,
        source: covered ? (metric === "gross_yield" ? "derived" : payload_source(state)) : null,
        reason: covered ? null : (GAP_REASON[k] ?? "No accepted source this release."),
      });
    }
  }

  const summary = {
    covered_cells: matrix.filter((c) => c.status === "covered").length,
    gap_cells: matrix.filter((c) => c.status === "gap").length,
    blocked_cells: matrix.filter((c) => c.status === "blocked").length,
    by_state: Object.fromEntries(STATES.map((s) => [s, {
      covered: matrix.filter((c) => c.state === s && c.status === "covered").length,
      total_cells: CELLS.length,
    }])),
  };
  const ledger = {
    generated_note: "National state × metric × property-type coverage-gap ledger for the official CC-BY lanes. Covered counts are from the pinned payload; gaps/blocks carry specific honest reasons. No fabricated coverage.",
    as_of: payload.as_of, payload_sha256: payload.payload_sha256, summary, matrix,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(ledger, null, 2));

  // Markdown rendering
  let md = `# National coverage-gap ledger (official CC-BY lanes)\n\n`;
  md += `_as-of ${payload.as_of} · payload \`${payload.payload_sha256.slice(0, 12)}…\`_\n\n`;
  md += `Covered **${summary.covered_cells}** · gap **${summary.gap_cells}** · blocked **${summary.blocked_cells}** (of ${matrix.length} cells).\n\n`;
  md += `| State | Metric | Type | Status | Suburbs | Source / reason |\n|---|---|---|---|--:|---|\n`;
  for (const c of matrix) {
    const badge = c.status === "covered" ? "✅ covered" : c.status === "gap" ? "➖ gap" : "⛔ blocked";
    md += `| ${c.state} | ${c.metric} | ${c.property_type} | ${badge} | ${c.suburb_count || ""} | ${c.status === "covered" ? c.source : c.reason} |\n`;
  }
  md += `\n> NSW is blocked (VG PSI 403; no CC-BY residential-sales bulk). VIC has no CC-BY house price, so no VIC yield. SA is fully covered incl. qualified house yields.\n`;
  fs.writeFileSync(OUT_MD, md);

  console.log(`coverage: covered=${summary.covered_cells} gap=${summary.gap_cells} blocked=${summary.blocked_cells}`);
  console.log(`by state: ${JSON.stringify(summary.by_state)}`);
  console.log(`ledger -> ${OUT_JSON} + ${OUT_MD}`);
}
function payload_source(state) { return state === "SA" ? "data.sa.gov.au (CC BY)" : state === "VIC" ? "dffh.vic.gov.au (CC BY)" : null; }
main();
