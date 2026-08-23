#!/usr/bin/env node
/**
 * Offline coverage × freshness × licence summary (read-only, no network, no writes).
 *
 * Reconciles the COMMITTED artifacts:
 *   - warehouse/reports/suburb_metric_coverage.json  (per-metric populated/missing)
 *   - warehouse/config/v3_source_registry.json       (licensed sources)
 * into a single honest picture that distinguishes DIRECT observations from
 * DERIVED metrics and states, per metric, how many suburbs are covered vs missing.
 *
 * Unlike suburb_metric_coverage.mjs (which live-queries the warehouse), this needs
 * NO credentials and NO network — so any reviewer can reproduce the split. It never
 * fabricates coverage: it only re-expresses the committed counts.
 *
 * Usage:
 *   node warehouse/scripts/coverage/coverage_freshness_summary.mjs [--json <out>]
 * Default is a human summary to stdout (dry-run; --json also writes a machine file).
 */
import fs from "fs";
import path from "path";

/** Metrics that are DERIVED from other observations (never a primary source read). */
export const DERIVED_METRICS = new Set(["gross_yield", "annual_price_growth_12m"]);

/**
 * Pure: turn a coverage report + registry into a deterministic summary.
 * @param {{total_suburb_snapshots:number, metrics:Array<{metric:string,populated:number,missing:number,pct:number}>}} coverage
 * @param {Array<{id:string,name:string,jurisdiction?:string,licence?:string,attribution?:string,cadence?:string}>} registry
 */
export function summarise(coverage, registry) {
  const total = coverage.total_suburb_snapshots ?? 0;
  const metrics = (coverage.metrics ?? []).map((m) => {
    const classification = DERIVED_METRICS.has(m.metric) ? "derived" : "direct";
    return {
      metric: m.metric,
      classification,
      populated: m.populated ?? 0,
      missing: m.missing ?? (total - (m.populated ?? 0)),
      pct: total > 0 ? Math.round(((m.populated ?? 0) / total) * 1000) / 10 : 0,
    };
  });

  const direct = metrics.filter((m) => m.classification === "direct");
  const derived = metrics.filter((m) => m.classification === "derived");
  const best = [...direct].sort((a, b) => a.pct - b.pct); // worst-covered first = highest-value gaps

  const jurisdictions = {};
  for (const s of registry) {
    const j = s.jurisdiction ?? "?";
    jurisdictions[j] = jurisdictions[j] ?? { sources: 0, licensedForReuse: 0 };
    jurisdictions[j].sources += 1;
    if ((s.licence ?? "").toLowerCase().includes("attribution") || (s.licence ?? "").toLowerCase().includes("cc by")) {
      jurisdictions[j].licensedForReuse += 1;
    }
  }

  return {
    generated_at: new Date().toISOString(),
    method: "offline reconciliation of committed suburb_metric_coverage.json + v3_source_registry.json (no network)",
    total_suburb_snapshots: total,
    registered_sources: registry.length,
    sources_by_jurisdiction: jurisdictions,
    direct_metrics: direct,
    derived_metrics: derived,
    highest_value_gaps: best.slice(0, 3).map((m) => ({ metric: m.metric, coverage_pct: m.pct, missing: m.missing })),
  };
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  const root = process.cwd();
  const coveragePath = path.join(root, "warehouse/reports/suburb_metric_coverage.json");
  const registryPath = path.join(root, "warehouse/config/v3_source_registry.json");
  if (!fs.existsSync(coveragePath) || !fs.existsSync(registryPath)) {
    console.error("Missing committed inputs (suburb_metric_coverage.json / v3_source_registry.json).");
    process.exit(1);
  }
  const summary = summarise(loadJson(coveragePath), loadJson(registryPath));

  console.log(`\nCoverage × freshness × licence summary (offline, ${summary.total_suburb_snapshots} suburbs)`);
  console.log(`Registered sources: ${summary.registered_sources}  ${JSON.stringify(summary.sources_by_jurisdiction)}`);
  console.log("\nDIRECT observation metrics (coverage %):");
  for (const m of summary.direct_metrics) console.log(`  ${m.metric.padEnd(28)} ${String(m.pct).padStart(5)}%  (${m.populated}/${summary.total_suburb_snapshots})`);
  console.log("\nDERIVED metrics (bounded by their inputs):");
  for (const m of summary.derived_metrics) console.log(`  ${m.metric.padEnd(28)} ${String(m.pct).padStart(5)}%  (${m.populated}/${summary.total_suburb_snapshots})`);
  console.log("\nHighest-value direct gaps:", summary.highest_value_gaps.map((g) => `${g.metric} @ ${g.coverage_pct}%`).join(", "));

  const jsonFlag = process.argv.indexOf("--json");
  if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
    fs.writeFileSync(process.argv[jsonFlag + 1], JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${process.argv[jsonFlag + 1]}`);
  }
  console.log("\n(dry-run: read-only, no warehouse connection, no writes)\n");
}

// Run only when invoked directly (kept importable + testable).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  main();
}
