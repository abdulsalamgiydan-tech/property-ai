#!/usr/bin/env node
/**
 * Shared source-aware refresh state machine (V4A). ONE engine for every accepted
 * official source (SA, VIC, …). Operating flow:
 *   scheduled discovery → change detection → immutable acquisition → validation →
 *   transformation → coverage comparison → local candidate → review evidence → HUMAN.
 *
 * Commands: detect | acquire | prepare | validate | compare | report | replay.
 * DRY-RUN by default. Local candidate prep requires --apply-local + --as-of.
 * There is intentionally NO command that promotes to any remote database — this
 * engine has no Supabase/Production write path.
 *
 * `detect` runs LIVE against the official CKAN catalogue (metadata only; no bytes
 * accepted without exact-byte SHA), compares against warehouse/config/refresh_lock.json,
 * and returns one machine state + a documented exit code so CI can distinguish
 * unchanged / prepared / blocked.
 *
 * Usage: node warehouse/scripts/refresh/refreshEngine.mjs detect [--source <id>] [--json]
 */
import fs from "fs";
import { V3_SOURCES } from "../../config/v3_source_registry.mjs";

export const STATES = {
  not_due: 0, unchanged: 0, candidate_ready: 10,
  metadata_changed_bytes_unchanged: 11, new_period_detected: 12, same_period_revision_detected: 13, historical_backfill_detected: 14,
  resource_removed: 20, source_unreachable: 21, source_access_blocked: 22, source_stale: 23,
  blocked_schema_drift: 30, blocked_licence_change: 31, blocked_integrity_failure: 32, blocked_row_anomaly: 33,
  blocked_geography_regression: 34, blocked_coverage_regression: 35, blocked_privacy_failure: 36, manual_review_required: 37,
};

/** Reporting-period rank (YYYYMM) from a resource name/url. Handles month-name,
 * Q<n> <year>, <n>Q <year>, and YYYY-MM formats. */
export function periodRank(s) {
  const str = String(s);
  const MON = { jan: 1, feb: 2, mar: 3, march: 3, apr: 4, may: 5, jun: 6, june: 6, jul: 7, aug: 8, sep: 9, sept: 9, september: 9, oct: 10, nov: 11, dec: 12, december: 12 };
  let m = str.match(/(jan|feb|mar|march|apr|may|jun|june|jul|aug|sep|sept|september|oct|nov|dec|december)\w*\s+(?:quarter\s+)?(\d{4})/i);
  if (m) return Number(m[2]) * 100 + (MON[m[1].toLowerCase()] || 0);
  m = str.match(/q\s*([1-4])\s*(\d{4})/i) || str.match(/([1-4])\s*q\s*(\d{4})/i); // Q2 2026 / 2Q 2026
  if (m) return Number(m[2]) * 100 + Number(m[1]) * 3;
  m = str.match(/(\d{4})[-_](0[1-9]|1[0-2])/); // 2026-03
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  return -1;
}

/**
 * Pure state decision. `current` = live discovery result; `locked` = accepted lock.
 * @returns {{state:string, reason:string}}
 */
export function decideState(locked, current, { licenceOk = true, schemaOk = true } = {}) {
  if (!current.reachable) return { state: current.status === 403 ? "source_access_blocked" : "source_unreachable", reason: `catalogue/resource not reachable (status ${current.status ?? "none"})` };
  if (current.resourceRemoved) return { state: "resource_removed", reason: "the previously accepted resource is no longer listed" };
  if (!licenceOk) return { state: "blocked_licence_change", reason: "licence/reuse terms changed since acceptance" };
  if (!schemaOk) return { state: "blocked_schema_drift", reason: "resource schema fingerprint changed" };
  if (current.periodRank > locked.period_rank) return { state: "new_period_detected", reason: `new reporting period available (${current.periodLabel} > locked ${locked.period_label})` };
  if (current.periodRank < locked.period_rank) return { state: "historical_backfill_detected", reason: `only an older period is currently latest (${current.periodLabel} < locked ${locked.period_label}) — backfill/regression, review` };
  // same period
  if (current.etag && locked.etag && current.etag !== locked.etag) return { state: "same_period_revision_detected", reason: "same period but ETag changed — possible in-place revision" };
  return { state: "unchanged", reason: `latest official period (${current.periodLabel}) already accepted` };
}

async function discoverCkan(pkgUrl, filterFn) {
  try {
    const j = await (await fetch(pkgUrl, { signal: AbortSignal.timeout(20000) })).json();
    const lic = j.result?.license_id ?? null;
    const cands = (j.result?.resources || []).map((r) => ({ ...r, _rank: Math.max(periodRank(r.name), periodRank((r.url || "").replace(/-/g, " "))) })).filter(filterFn).filter((r) => r._rank > 0).sort((a, b) => b._rank - a._rank);
    if (!cands.length) return { reachable: true, periodRank: -1, resourceRemoved: true, licenceId: lic };
    const top = cands[0];
    let etag = null, lastModified = null;
    try { const h = await fetch(top.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(25000) }); etag = h.headers.get("etag"); lastModified = h.headers.get("last-modified"); } catch { /* metadata best-effort */ }
    return { reachable: true, periodRank: top._rank, periodLabel: String(top.name).slice(0, 60), licenceId: lic, etag, lastModified, url: top.url };
  } catch (e) {
    return { reachable: false, status: /403/.test(e.message) ? 403 : null, error: e.message };
  }
}

const DISCOVERY = {
  sa_metro_median_house_sales: () => discoverCkan("https://data.sa.gov.au/data/api/3/action/package_show?id=metro-median-house-sales", (r) => (r.format || "").toUpperCase() === "XLSX"),
  sa_private_rental_report: () => discoverCkan("https://data.sa.gov.au/data/api/3/action/package_show?id=private-rent-report", (r) => (r.format || "").toUpperCase() === "XLSX"),
  vic_dffh_moving_annual_rent: () => discoverCkan("https://discover.data.vic.gov.au/api/3/action/package_show?id=rental-report-quarterly-moving-annual-rents-by-suburb", (r) => (r.format || "").toUpperCase() === "XLSX" && /rent-?s?-suburb/i.test(r.url || "") && /-excel$/.test(r.url || "")),
};

async function detect(sourceFilter, asJson) {
  const lock = JSON.parse(fs.readFileSync("warehouse/config/refresh_lock.json", "utf8"));
  const accepted = V3_SOURCES.filter((s) => s.disposition === "accepted_official_reusable" && (!sourceFilter || s.id === sourceFilter));
  const results = [];
  for (const s of accepted) {
    const locked = lock.sources[s.id];
    if (!DISCOVERY[s.id] || !locked) { results.push({ source: s.id, state: "manual_review_required", reason: "no discovery/lock configured" }); continue; }
    const current = await DISCOVERY[s.id]();
    const licenceOk = current.licenceId == null || /cc-by/i.test(current.licenceId);
    // Compute the locked rank from its label with the SAME function so a
    // hand-entered rank can never diverge from the engine's convention.
    const lockedWithRank = { ...locked, period_rank: periodRank(locked.period_label) };
    const { state, reason } = decideState(lockedWithRank, current, { licenceOk });
    results.push({ source: s.id, jurisdiction: s.jurisdiction, state, reason, exit_code: STATES[state], current_period: current.periodLabel ?? null, locked_period: locked.period_label });
  }
  const worst = results.reduce((mx, r) => Math.max(mx, STATES[r.state] ?? 0), 0);
  const out = { command: "detect", generated_at: new Date().toISOString(), results };
  if (asJson) console.log(JSON.stringify(out, null, 2));
  else { console.log(`\nRefresh detect (dry-run) — ${results.length} accepted source(s)`); for (const r of results) console.log(`  ${r.source.padEnd(32)} ${r.state.padEnd(28)} (exit ${r.exit_code})  ${r.reason}`); }
  return worst;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || "detect";
  const si = argv.indexOf("--source"); const sourceFilter = si !== -1 ? argv[si + 1] : null;
  const asJson = argv.includes("--json");
  if (cmd === "detect") { process.exit(await detect(sourceFilter, asJson)); }
  if (["acquire", "prepare", "validate", "compare", "report", "replay"].includes(cmd)) {
    console.log(`[${cmd}] dry-run stub: run the per-source ingest (build_sa_warehouse.mjs / build_vic_warehouse.mjs) with --apply-local --as-of to prepare a LOCAL candidate. No remote promotion path exists.`);
    process.exit(0);
  }
  console.error(`unknown command '${cmd}'. Use: detect|acquire|prepare|validate|compare|report|replay`); process.exit(2);
}
if (import.meta.url === (await import("url")).pathToFileURL(process.argv[1] || "").href) main();
