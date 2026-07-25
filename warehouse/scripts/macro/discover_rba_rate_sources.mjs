#!/usr/bin/env node
/**
 * RBA interest-rate source discovery (Sprint 8, Part A).
 *
 * Verifies three official RBA statistical tables against the live
 * rba.gov.au endpoints (plain HTTPS — no Cloudflare/bot protection observed
 * on this host, unlike NSW VG PSI in Sprint 5) and one explicitly-excluded
 * forecast table found during discovery:
 *
 *   - A2  Changes in Monetary Policy and Administered Rates (cash rate target)
 *   - F6  Housing Lending Rates (2019-current, owner-occupier/investor x
 *         variable/fixed, outstanding, all institutions)
 *   - F5  Indicator Lending Rates (housing subset — long-run standard
 *         variable + 3yr fixed, back to 1959)
 *   - J1  Market Economists' Cash Rate Forecasts — EXCLUDED (forecast
 *         product; this sprint's hard rules forbid loading forecasts)
 *
 * No bulk data is loaded to a local table here — that is
 * build_rba_rates_local_store.mjs's job. This script only confirms each
 * URL resolves, inspects its header/series-ID row against the curated
 * series list this sprint intends to load, and records licence terms.
 *
 * Outputs:
 *   warehouse/reports/rba_rates_source_manifest.json
 *   warehouse/reports/rba_rates_source_manifest.md
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const reportsDir = path.join(repoRoot, "warehouse", "reports");
const RAW_ROOT = "warehouse/data/raw/rba_rates"; // gitignored

const PUBLISHER = "Reserve Bank of Australia";
const UA = "propellect-warehouse/1.0";

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) });
  return { ok: res.ok, status: res.status, contentType: res.headers.get("content-type"), text: res.ok ? await res.text() : null };
}
async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) });
  return { ok: res.ok, status: res.status, contentType: res.headers.get("content-type"), buf: res.ok ? Buffer.from(await res.arrayBuffer()) : null };
}
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

console.log("Verifying official RBA statistical-table endpoints (plain HTTPS, no bulk data loaded)...");

// ── A2: Cash Rate Target ────────────────────────────────────────────────
const A2_URL = "https://www.rba.gov.au/statistics/tables/xls/a02hist.xlsx";
const a2Resp = await fetchBuffer(A2_URL);
let a2 = { url: A2_URL, ok: a2Resp.ok, status: a2Resp.status, contentType: a2Resp.contentType, rows: 0, seriesIdFound: false, firstDate: null, lastDate: null, rangeFormatRows: 0 };
if (a2Resp.ok) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(a2Resp.buf);
  const ws = wb.getWorksheet("Data");
  const seriesRow = ws.getRow(11);
  a2.seriesIdFound = seriesRow.getCell(3).value === "ARBAMPCNCRT";
  for (let r = 12; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = row.getCell(1).value;
    const target = row.getCell(3).value;
    if (!date) continue;
    a2.rows++;
    if (!a2.firstDate) a2.firstDate = date;
    a2.lastDate = date;
    if (typeof target === "string") a2.rangeFormatRows++;
  }
}
console.log(`  A2 (cash rate target): HTTP ${a2.status}, series ARBAMPCNCRT ${a2.seriesIdFound ? "found" : "NOT FOUND"}, ${a2.rows} change-events, ${a2.firstDate ?? "?"} .. ${a2.lastDate ?? "?"}, ${a2.rangeFormatRows} range-format rows`);

// ── F6: Housing Lending Rates ───────────────────────────────────────────
const F6_URL = "https://www.rba.gov.au/statistics/tables/csv/f6-data.csv";
const F6_SERIES = ["FLRHOOTA", "FLRHOOVA", "FLRHOOFA", "FLRHOOFB", "FLRHIOTA", "FLRHIOVA", "FLRHIOFA", "FLRHIOFB"];
const f6Resp = await fetchText(F6_URL);
let f6 = { url: F6_URL, ok: f6Resp.ok, status: f6Resp.status, contentType: f6Resp.contentType, seriesFound: [], firstDate: null, lastDate: null, dataRows: 0 };
if (f6Resp.ok) {
  const lines = f6Resp.text.replace(/^﻿/, "").split(/\r?\n/);
  const seriesIdRow = parseCsvLine(lines[10]);
  f6.seriesFound = F6_SERIES.filter((s) => seriesIdRow.includes(s));
  const dataLines = lines.slice(11).filter((l) => l.trim().length > 0);
  f6.dataRows = dataLines.length;
  if (dataLines.length > 0) {
    f6.firstDate = parseCsvLine(dataLines[0])[0];
    f6.lastDate = parseCsvLine(dataLines[dataLines.length - 1])[0];
  }
}
console.log(`  F6 (housing lending rates): HTTP ${f6.status}, ${f6.seriesFound.length}/${F6_SERIES.length} target series found, ${f6.dataRows} months, ${f6.firstDate ?? "?"} .. ${f6.lastDate ?? "?"}`);

// ── F5: Indicator Lending Rates (housing subset) ────────────────────────
const F5_URL = "https://www.rba.gov.au/statistics/tables/csv/f5-data.csv";
const F5_SERIES = ["FILRHLBVS", "FILRHL3YF", "FILRHLBVSI", "FILRHL3YFI"];
const f5Resp = await fetchText(F5_URL);
let f5 = { url: F5_URL, ok: f5Resp.ok, status: f5Resp.status, contentType: f5Resp.contentType, seriesFound: [], perSeries: {} };
if (f5Resp.ok) {
  const lines = f5Resp.text.replace(/^﻿/, "").split(/\r?\n/);
  const seriesIdRow = parseCsvLine(lines[10]);
  f5.seriesFound = F5_SERIES.filter((s) => seriesIdRow.includes(s));
  const dataLines = lines.slice(11).filter((l) => l.trim().length > 0).map(parseCsvLine);
  for (const s of f5.seriesFound) {
    const idx = seriesIdRow.indexOf(s);
    let first = null, last = null, count = 0;
    for (const row of dataLines) {
      if (row[idx] !== undefined && row[idx] !== "") { if (!first) first = row[0]; last = row[0]; count++; }
    }
    f5.perSeries[s] = { first, last, count };
  }
}
console.log(`  F5 (indicator lending rates): HTTP ${f5.status}, ${f5.seriesFound.length}/${F5_SERIES.length} target series found`);

// ── J1: Market Economists' Cash Rate Forecasts (verify + exclude) ──────
const J1_URL = "https://www.rba.gov.au/statistics/tables/csv/j1-cash-rate.csv";
const j1Resp = await fetchText(J1_URL);
let j1IsForecast = false;
let j1Title = null;
if (j1Resp.ok) {
  const lines = j1Resp.text.replace(/^﻿/, "").split(/\r?\n/);
  j1Title = lines[0];
  j1IsForecast = /FORECAST/i.test(j1Title);
}
console.log(`  J1 (link read "Cash Rate" but table is titled "${j1Title ?? "?"}") — forecast product: ${j1IsForecast ? "CONFIRMED, excluding" : "not confirmed"}`);

// ── Licence check ────────────────────────────────────────────────────────
const copyrightResp = await fetchText("https://www.rba.gov.au/copyright/");
const ccByFound = copyrightResp.ok && /Creative Commons Attribution\s*4\.0/i.test(copyrightResp.text);
console.log(`  Copyright notice: HTTP ${copyrightResp.status}, CC BY 4.0 mention found: ${ccByFound}`);

// ── Build manifest ────────────────────────────────────────────────────────

const entries = [
  {
    source_id: "rba_a2",
    dataset_id: "rba_cash_rate_target",
    entry_type: "bulk_file_download",
    dataset_name: "RBA Statistical Table A2 — Changes in Monetary Policy and Administered Rates",
    publisher: PUBLISHER,
    official_url: "https://www.rba.gov.au/statistics/cash-rate/",
    download_url: A2_URL,
    file_format: "xlsx (2 sheets: Data, Notes)",
    measure: "Cash Rate Target (Series ID ARBAMPCNCRT) — 'New Cash Rate Target' as announced after each Monetary Policy Board decision that actually changed the rate. Event table: one row per rate-change announcement, effective the following day (same day prior to Feb 2008).",
    available_history: `${a2.firstDate ? new Date(a2.firstDate).toISOString().slice(0, 10) : "unknown"} to ${a2.lastDate ? new Date(a2.lastDate).toISOString().slice(0, 10) : "unknown"} (${a2.rows} change-events)`,
    refresh_frequency: "as_announced (irregular; updated after each Monetary Policy Board meeting where the rate changes)",
    known_limitations: [
      `${a2.rangeFormatRows} of ${a2.rows} rows record the target as a RANGE of values (pre-Aug-1990 RBA practice), not a single number — stored with rate_percent = NULL and data_quality_status = 'range_not_numeric'; raw range text preserved in the local store only, never estimated to a single value.`,
      "This table only has a row when the rate actually changed — not the same as 'every Board meeting including holds'. The richer meeting-by-meeting table on /statistics/cash-rate/ (400 HTML rows) has no dedicated CSV/XLSX download and was not used as the load source.",
    ],
    licence_notes: "RBA Copyright and Disclaimer Notice, Section 4 (Cash Rate special conditions) — internal research/statistical use with attribution; not redistributed as a financial benchmark by this warehouse.",
    intended_raw_storage_path: `${RAW_ROOT}/a02hist.xlsx`,
    intended_local_table: "rba_rates.duckdb :: rba_cash_rate_target",
    intended_core_table: "core.fact_interest_rates (rate_type='cash_rate_target')",
    verification: { http_status: a2.status, series_id_confirmed: a2.seriesIdFound },
    status: a2Resp.ok && a2.seriesIdFound ? "discovered" : "needs_review",
  },
  {
    source_id: "rba_f6",
    dataset_id: "rba_housing_lending_rates",
    entry_type: "bulk_file_download",
    dataset_name: "RBA Statistical Table F6 — Housing Lending Rates",
    publisher: `${PUBLISHER} (data sourced from APRA + RBA)`,
    official_url: "https://www.rba.gov.au/statistics/interest-rates/",
    download_url: F6_URL,
    xlsx_alternative_url: "https://www.rba.gov.au/statistics/tables/xls/f06hist.xlsx",
    file_format: "csv (metadata header rows + monthly data rows; 62 series columns total, 8 curated series loaded)",
    measure: "Weighted-average lending rates on housing credit outstanding, by owner-occupier/investor and by rate type (variable / fixed <=3yr / fixed >3yr), all authorised deposit-taking institutions. Modern (2019-current) APRA-sourced series.",
    available_history: `${f6.firstDate ?? "unknown"} to ${f6.lastDate ?? "unknown"} (${f6.dataRows} months)`,
    refresh_frequency: "monthly",
    series_loaded: [
      { series_id: "FLRHOOTA", borrower_type: "owner_occupier", loan_type: "all", title: "Outstanding; Owner-occupied; All loans; All institutions" },
      { series_id: "FLRHOOVA", borrower_type: "owner_occupier", loan_type: "variable", title: "Outstanding; Owner-occupied; Variable-rate; All institutions" },
      { series_id: "FLRHOOFA", borrower_type: "owner_occupier", loan_type: "fixed_le_3y", title: "Outstanding; Owner-occupied; Fixed-rate <=3yr residual" },
      { series_id: "FLRHOOFB", borrower_type: "owner_occupier", loan_type: "fixed_gt_3y", title: "Outstanding; Owner-occupied; Fixed-rate >3yr residual" },
      { series_id: "FLRHIOTA", borrower_type: "investor", loan_type: "all", title: "Outstanding; Investment; All loans; All institutions" },
      { series_id: "FLRHIOVA", borrower_type: "investor", loan_type: "variable", title: "Outstanding; Investment; Variable-rate; All institutions" },
      { series_id: "FLRHIOFA", borrower_type: "investor", loan_type: "fixed_le_3y", title: "Outstanding; Investment; Fixed-rate <=3yr residual" },
      { series_id: "FLRHIOFB", borrower_type: "investor", loan_type: "fixed_gt_3y", title: "Outstanding; Investment; Fixed-rate >3yr residual" },
    ],
    series_not_loaded_reason: "F6 has 62 total columns split across 'Outstanding' vs 'New loans funded in the month' bases, plus repayment-type, LVR-band, loan-value-band splits and 'Large institutions'-only variants. Only the 8 'Outstanding, All institutions' series were loaded to keep this module compact per the task's 'keep this sprint small' instruction.",
    licence_notes: "CC BY 4.0",
    intended_raw_storage_path: `${RAW_ROOT}/f6-data.csv`,
    intended_local_table: "rba_rates.duckdb :: rba_housing_lending_rates_f6",
    intended_core_table: "core.fact_interest_rates (rate_type='housing_lending_rate', borrower_type/loan_type populated)",
    verification: { http_status: f6.status, series_found: f6.seriesFound.length, series_expected: F6_SERIES.length },
    status: f6Resp.ok && f6.seriesFound.length === F6_SERIES.length ? "discovered" : "needs_review",
  },
  {
    source_id: "rba_f5",
    dataset_id: "rba_indicator_lending_rates_housing",
    entry_type: "bulk_file_download",
    dataset_name: "RBA Statistical Table F5 — Indicator Lending Rates (housing subset)",
    publisher: PUBLISHER,
    official_url: "https://www.rba.gov.au/statistics/interest-rates/",
    download_url: F5_URL,
    xlsx_alternative_url: "https://www.rba.gov.au/statistics/tables/xls/f05hist.xlsx",
    series_breaks_url: "https://www.rba.gov.au/statistics/tables/csv/f5-series-breaks.csv",
    file_format: "csv (metadata header rows + monthly data rows; 29 series columns total, 4 housing series loaded)",
    measure: "Older/longer-run indicator lending rate series predating the APRA housing-credit collection; gives the long-run 'standard variable' bank mortgage rate directly.",
    refresh_frequency: "monthly",
    series_loaded: [
      { series_id: "FILRHLBVS", borrower_type: "owner_occupier", loan_type: "standard_variable", title: "Housing loans; Banks; Variable; Standard; Owner-occupier", history: `${f5.perSeries.FILRHLBVS?.first ?? "?"} to ${f5.perSeries.FILRHLBVS?.last ?? "?"} (${f5.perSeries.FILRHLBVS?.count ?? 0} months)` },
      { series_id: "FILRHL3YF", borrower_type: "owner_occupier", loan_type: "fixed_3y", title: "Housing loans; Banks; 3-year fixed; Owner-occupier", history: `${f5.perSeries.FILRHL3YF?.first ?? "?"} to ${f5.perSeries.FILRHL3YF?.last ?? "?"} (${f5.perSeries.FILRHL3YF?.count ?? 0} months)` },
      { series_id: "FILRHLBVSI", borrower_type: "investor", loan_type: "standard_variable", title: "Housing loans; Banks; Variable; Standard; Investor", history: `${f5.perSeries.FILRHLBVSI?.first ?? "?"} to ${f5.perSeries.FILRHLBVSI?.last ?? "?"} (${f5.perSeries.FILRHLBVSI?.count ?? 0} months)` },
      { series_id: "FILRHL3YFI", borrower_type: "investor", loan_type: "fixed_3y", title: "Housing loans; Banks; 3-year fixed; Investor", history: `${f5.perSeries.FILRHL3YFI?.first ?? "?"} to ${f5.perSeries.FILRHL3YFI?.last ?? "?"} (${f5.perSeries.FILRHL3YFI?.count ?? 0} months)` },
    ],
    known_limitations: [
      "F5 and F6 use different collection methodologies and are NOT spliced into one continuous series — stored as distinct rate_type/loan_type combinations. A dedicated f5-series-breaks.csv documents internal breaks within F5 itself; not consumed this sprint (informational only, raw published values loaded as-is).",
    ],
    series_not_loaded_reason: "F5 also covers small-business, personal, credit-card and large-business lending rates (25 of 29 columns) — out of scope for a residential-property warehouse.",
    licence_notes: "CC BY 4.0",
    intended_raw_storage_path: `${RAW_ROOT}/f5-data.csv`,
    intended_local_table: "rba_rates.duckdb :: rba_indicator_lending_rates_f5",
    intended_core_table: "core.fact_interest_rates (rate_type='indicator_lending_rate', borrower_type/loan_type populated)",
    verification: { http_status: f5.status, series_found: f5.seriesFound.length, series_expected: F5_SERIES.length },
    status: f5Resp.ok && f5.seriesFound.length === F5_SERIES.length ? "discovered" : "needs_review",
  },
  {
    source_id: "rba_j1",
    dataset_id: "rba_cash_rate_forecasts",
    entry_type: "bulk_file_download",
    dataset_name: "RBA Statistical Table J1 — Market Economists' Cash Rate Forecasts",
    publisher: `${PUBLISHER} (survey of market economists)`,
    official_url: "https://www.rba.gov.au/statistics/tables/",
    download_url: J1_URL,
    status: "out_of_scope",
    notes: `Discovered while browsing the RBA statistical tables index (link text read "J1 - Cash Rate", misleading — the table itself is titled "${j1Title ?? "MARKET ECONOMISTS' FORECASTS"}" and contains survey-based median/mean/low/high forecast cash rates by target quarter, not historical actuals). Excluded per this sprint's hard rule against loading forecasts. Verified programmatically: title contains "FORECAST" = ${j1IsForecast}.`,
  },
];

const manifest = {
  generated_at: new Date().toISOString(),
  policy: {
    official_rba_only: true,
    no_commercial_scraping: true,
    raw_files_outside_git: RAW_ROOT,
    unverified_sources_marked: "needs_review",
    scope: "National macro context only. Cash rate target full history plus a compact, well-labelled set of official housing lending-rate series. No forecast/survey products loaded.",
    download_method_note: "rba.gov.au has no Cloudflare/bot protection observed on statistics pages or CSV/XLSX endpoints — plain HTTPS GET succeeds directly (verified by this script). A gstack /browse session was used only for interactive discovery/navigation, not for the actual data fetches.",
  },
  licence: {
    summary: "Most RBA website material is CC BY 4.0 and may be reproduced/adapted with attribution to the RBA.",
    cash_rate_special_conditions: "The Cash Rate Target and other financial data are subject to additional terms in Sections 4-5 of the RBA Copyright and Disclaimer Notice. This warehouse uses it for internal research/statistical context only.",
    source_url: "https://www.rba.gov.au/copyright/",
    cc_by_4_0_confirmed: ccByFound,
    attribution_required: "Reserve Bank of Australia (RBA)",
  },
  entries,
};

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(path.join(reportsDir, "rba_rates_source_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] || 0) + 1), a), {});
const md = `# RBA Interest Rate Sources — Manifest (Sprint 8, Part A)

Generated: ${manifest.generated_at} (full detail: \`rba_rates_source_manifest.json\`)
Statuses: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}.

## Verification

\`rba.gov.au\` has no bot/challenge protection on statistics pages or data
endpoints (unlike the NSW VG PSI portal used in Sprint 5) — every URL below was
verified live by this script with a direct HTTPS GET.

## Sources loaded

| dataset | table | measure | history | rows targeted |
|---|---|---|---|---|
| A2 | Changes in Monetary Policy and Administered Rates | Cash Rate Target | ${entries[0].available_history} | ${a2.rows} events |
| F6 | Housing Lending Rates | Owner-occupier/investor x variable/fixed, outstanding, all institutions | ${entries[1].available_history} | 8 series x ${f6.dataRows} months |
| F5 | Indicator Lending Rates (housing subset) | Standard variable + 3yr fixed, owner-occupier/investor | varies by series | 4 series |

## Licence

Most RBA website material is **CC BY 4.0** with attribution to the RBA
(confirmed live: ${ccByFound}). The Cash Rate Target carries additional
conditions under Section 4 of the RBA Copyright and Disclaimer Notice
(\`rba.gov.au/copyright/\`) as a financial benchmark — used for internal
research/statistical context only, never redistributed as a benchmark rate.

## Explicitly excluded

**RBA Table J1 (Market Economists' Cash Rate Forecasts)** — misleadingly
linked as "J1 – Cash Rate" on the tables index, but the table itself
(title: "${j1Title ?? "unknown"}") is a survey-based forecast product.
Excluded per this sprint's hard rule against loading forecasts.

**The full "every meeting including holds" cash-rate decision table** on
\`rba.gov.au/statistics/cash-rate/\` (400 HTML rows) has no dedicated
CSV/XLSX download — A2 (${a2.rows} rows, only actual rate-change events) is
the official machine-readable source used instead.

## Known data-quality note carried into Part C/D

${a2.rangeFormatRows} of the A2 rows record the cash rate target as a
**range** (pre-August-1990 RBA practice). Loaded with \`rate_percent = NULL\`
and \`data_quality_status = 'range_not_numeric'\` — no value invented.

## Scope decision: F5 vs F6 not spliced

F5 and F6 use different collection methodologies and mostly non-overlapping
date ranges. Stored as **separate** \`rate_type\` values
(\`indicator_lending_rate\` vs \`housing_lending_rate\`), never joined into
one continuous series.
`;
fs.writeFileSync(path.join(reportsDir, "rba_rates_source_manifest.md"), md);

console.log(`\nManifest written: ${entries.length} entries (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
console.log("  warehouse/reports/rba_rates_source_manifest.json");
console.log("  warehouse/reports/rba_rates_source_manifest.md");
console.log("No bulk data downloaded to local storage; no database contacted.");

const allOk = entries.filter((e) => e.status !== "out_of_scope").every((e) => e.status === "discovered");
if (!allOk) {
  console.error("\nERROR: one or more sources not fully verified — resolve before running build_rba_rates_local_store.mjs (hard stop)");
  process.exit(1);
}
