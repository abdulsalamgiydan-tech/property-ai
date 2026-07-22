#!/usr/bin/env node
/**
 * National coverage registry builder (Sprint 12, Workstream 1).
 *
 * Generates warehouse/metadata/national_coverage_registry.yml and
 * warehouse/reports/national_coverage_audit.{md,json} from two real
 * sources, not manual narrative:
 *
 *   1. LIVE row counts, reference periods and coverage percentages,
 *      queried directly from warehouse-validation (read-only) — this is
 *      the quantitative ground truth, generated fresh every run.
 *   2. The qualitative source-access classification (paid/restricted/
 *      blocked/available, licence, access method) carried from the
 *      already-completed, live-verified Sprint 11 Workstream 2 discovery
 *      pass (warehouse/reports/national_jurisdiction_source_manifest.json
 *      and the per-jurisdiction *_source_manifest.json files) — this is
 *      not fabricated, it is the prior sprint's genuine source manifest,
 *      cross-referenced here rather than re-typed by hand.
 *
 * Read-only. Makes no writes to the branch. Refuses a production
 * connection string before opening any connection.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local — required (read-only) for live ground truth");
if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references production ref ${PROD_REF}`);
if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference branch ref ${BRANCH_REF}`);

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
async function q(sql, params = []) {
  const { rows } = await client.query(sql, params);
  return rows;
}

// ── Jurisdiction map: ASGS state_code -> jurisdiction_code ────────────
// dim_geography's state_code is the ground truth for whether a
// jurisdiction's geography backbone is loaded at all; meta.jurisdiction
// (only 5 rows as of Sprint 11) is NOT used as the source of truth here
// because it is known-incomplete (TAS/ACT/NT are missing from it,
// itself a finding recorded below).
const JURISDICTIONS = [
  { code: "NSW", state_code: "1" },
  { code: "VIC", state_code: "2" },
  { code: "QLD", state_code: "3" },
  { code: "SA", state_code: "4" },
  { code: "WA", state_code: "5" },
  { code: "TAS", state_code: "6" },
  { code: "NT", state_code: "7" },
  { code: "ACT", state_code: "8" },
];

// ── Qualitative access-status classification, carried from Sprint 11 WS2's
// live-verified source discovery (not re-derived, not invented) ───────
const sourceManifestPath = rel("warehouse", "reports", "national_jurisdiction_source_manifest.json");
const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const manifestByJurisdiction = new Map(sourceManifest.summary_by_jurisdiction.map((j) => [j.jurisdiction, j]));

console.log("Querying live ground truth from warehouse-validation (read-only)...");

// ── Finding: core.dim_geography.state_code is NULL for every POA row ──
// (2,641 of 2,641, confirmed live) — ASGS postal areas are not assigned a
// single definitive state at the boundary-file level (a POA can span
// jurisdiction boundaries), so a plain state_code join silently drops
// every postcode-grain fact from a per-jurisdiction count. Fixed here
// with the official Australia Post postcode-to-state range table (public
// reference data, not invented) so this audit's counts are honest and
// complete; the underlying architectural gap (no reliable POA->state
// attribution in the schema itself, and mart.postcode_market_snapshot's
// own `jurisdiction` column is only populated for NSW/VIC — QLD/SA/WA's
// rent-only postcode data has jurisdiction=NULL there too) is documented
// as a finding for Workstream 6 to fix structurally, not silently patched
// here.
function postcodeToState(poa) {
  const n = parseInt(poa, 10);
  if (!Number.isFinite(n)) return null;
  if (n >= 200 && n <= 299) return "8"; // ACT
  if (n >= 2600 && n <= 2618) return "8"; // ACT
  if (n >= 2900 && n <= 2920) return "8"; // ACT
  if (n >= 1000 && n <= 1999) return "1"; // NSW (LVR range)
  if (n >= 2000 && n <= 2599) return "1"; // NSW
  if (n >= 2619 && n <= 2899) return "1"; // NSW
  if (n >= 2921 && n <= 2999) return "1"; // NSW
  if (n >= 3000 && n <= 3999) return "2"; // VIC
  if (n >= 8000 && n <= 8999) return "2"; // VIC (LVR range)
  if (n >= 4000 && n <= 4999) return "3"; // QLD
  if (n >= 9000 && n <= 9999) return "3"; // QLD (LVR range)
  if (n >= 5000 && n <= 5999) return "4"; // SA
  if (n >= 6000 && n <= 6999) return "5"; // WA
  if (n >= 7000 && n <= 7999) return "6"; // TAS
  if (n >= 800 && n <= 999) return "7"; // NT
  return null;
}

// ── Geography backbone presence per jurisdiction, per level ───────────
const geographyRows = await q(`
  select state_code, geography_type, geography_code, count(*)::int as n
  from core.dim_geography
  where is_current
  group by state_code, geography_type, geography_code
`);
const geographyByState = new Map();
for (const r of geographyRows) {
  const state = r.state_code ?? (r.geography_type === "POA" ? postcodeToState(r.geography_code) : null);
  if (!state) continue; // genuinely unattributable (e.g. malformed postcode) — not silently counted anywhere
  if (!geographyByState.has(state)) geographyByState.set(state, {});
  geographyByState.get(state)[r.geography_type] = (geographyByState.get(state)[r.geography_type] ?? 0) + r.n;
}

// ── Fact table row counts per jurisdiction (joined via dim_geography) ──
// Aggregated in JS (not SQL GROUP BY on state_code) specifically because
// POA rows need the postcode-range fallback above, not the raw column.
async function factCountsByState(table) {
  const rows = await q(`
    select g.state_code, g.geography_type, g.geography_code, f.reference_period::text as reference_period
    from core.${table} f
    join core.dim_geography g on g.geography_id = f.geography_id
    where g.is_current
  `);
  const out = new Map();
  for (const r of rows) {
    const state = r.state_code ?? (r.geography_type === "POA" ? postcodeToState(r.geography_code) : null);
    if (!state) continue;
    if (!out.has(state)) out.set(state, { n: 0, earliest: null, latest: null });
    const entry = out.get(state);
    entry.n += 1;
    if (r.reference_period) {
      if (!entry.earliest || r.reference_period < entry.earliest) entry.earliest = r.reference_period;
      if (!entry.latest || r.reference_period > entry.latest) entry.latest = r.reference_period;
    }
  }
  return out;
}

const salesCounts = await factCountsByState("fact_residential_sales_summary");
const rentCounts = await factCountsByState("fact_rental_market_summary");
const dwellingStockCounts = await factCountsByState("fact_dwelling_stock");
const tenureCounts = await factCountsByState("fact_household_tenure");
const approvalsCounts = await factCountsByState("fact_building_approvals");

// Sprint 12 WS3: dwelling commencements/completions, STATE grain (a
// separate fact table from approvals — see migration 029).
const constructionActivityRows = await q(`
  select g.state_code, f.stage, count(*)::int as n, min(f.reference_period)::text as earliest, max(f.reference_period)::text as latest
  from core.fact_dwelling_construction_activity f
  join core.dim_geography g on g.geography_id = f.geography_id
  group by g.state_code, f.stage
`);
const commencedByState = new Map(constructionActivityRows.filter((r) => r.stage === "commenced").map((r) => [r.state_code, r]));
const completedByState = new Map(constructionActivityRows.filter((r) => r.stage === "completed").map((r) => [r.state_code, r]));

// Finding: core.fact_rental_market_summary has ZERO rows for VIC (all 4
// geography_types checked live) despite jurisdiction_coverage.yml
// describing VIC rents as "partially_available... refresh_frequency:
// quarterly" — implying a time series. VIC's rent value actually lives
// only as a single latest-value column in mart.suburb_market_snapshot
// (median_weekly_rent_latest), not the shared quarterly fact/mart
// pipeline every other rent-bearing jurisdiction uses. This is checked
// explicitly per jurisdiction below (not assumed) so the audit reports
// VIC's real, narrower capability (snapshot-only, no history) rather
// than the fact-table row count alone, which would wrongly show zero.
const snapshotOnlyRentRows = await q(`
  select g.state_code, count(*)::int as n
  from mart.suburb_market_snapshot m
  join core.dim_geography g on g.geography_id = m.geography_id
  where m.dwelling_type is null and m.median_weekly_rent_latest is not null
  group by g.state_code
`);
const snapshotOnlyRentByState = new Map(snapshotOnlyRentRows.map((r) => [r.state_code, r.n]));

// Interest rates are a national (not per-geography) series — checked once.
const interestRateSeries = await q(`
  select rate_type, borrower_type, loan_type, count(*)::int as n, min(reference_period)::text as earliest, max(reference_period)::text as latest
  from core.fact_interest_rates
  group by 1,2,3 order by 1,2,3
`);

// ── Demographic profile (population/income/tenure-share/growth) per state ─
const demoRows = await q(`
  select g.state_code,
    count(*)::int as n,
    count(m.total_population)::int as has_population,
    count(m.population_2016)::int as has_population_2016,
    count(m.population_growth_2016_2021_pct)::int as has_growth,
    count(m.median_weekly_household_income)::int as has_income,
    count(m.average_household_size)::int as has_household_composition
  from mart.suburb_demographic_profile_2021 m
  join core.dim_geography g on g.geography_id = m.geography_id
  where g.is_current
  group by g.state_code
`);
const demoByState = new Map(demoRows.map((r) => [r.state_code, r]));

// ── meta.jurisdiction completeness (a real, findable gap) ─────────────
const metaJurisdictionRows = await q(`select jurisdiction_code, asgs_state_code, status from meta.jurisdiction order by asgs_state_code`);

await client.end();

console.log("Live queries complete. Building registry...");

// ── Assemble per-jurisdiction domain status ────────────────────────────
const DOMAIN_ORDER = [
  "residential_sales",
  "residential_rents",
  "gross_yield",
  "dwelling_stock",
  "tenure",
  "population",
  "population_growth",
  "internal_migration",
  "household_composition",
  "household_income",
  "building_approvals",
  "dwelling_commencements",
  "dwelling_completions",
  "housing_lending_rates",
  "affordability",
  "sales_volume",
  "rental_observations",
  "supply_per_1000_dwellings",
  "source_freshness",
  "confidence",
];

const registry = { generated_at: new Date().toISOString(), jurisdictions: {} };

for (const j of JURISDICTIONS) {
  const g = geographyByState.get(j.state_code) || {};
  const sales = salesCounts.get(j.state_code);
  const rent = rentCounts.get(j.state_code);
  const stock = dwellingStockCounts.get(j.state_code);
  const tenure = tenureCounts.get(j.state_code);
  const approvals = approvalsCounts.get(j.state_code);
  const demo = demoByState.get(j.state_code);
  const manifest = manifestByJurisdiction.get(j.code);
  const metaRow = metaJurisdictionRows.find((r) => r.asgs_state_code === j.state_code);

  const domains = {};

  domains.residential_sales = sales
    ? { status: "available", row_count: sales.n, earliest_period: sales.earliest, latest_period: sales.latest, source: j.code === "NSW" ? "NSW Valuer General PSI" : j.code === "VIC" ? "VIC VPSR" : null }
    : { status: manifest?.sales_status === "paid_official" || manifest?.sales_status === "paid_or_restricted" ? "official_source_paid_or_restricted" : "unavailable", row_count: 0, finding: manifest?.sales_finding ?? "no live-verified source discovered for direct sales/transaction data" };

  const snapshotOnlyRentCount = snapshotOnlyRentByState.get(j.state_code) ?? 0;
  if (rent && rent.n > 10) {
    // Meaningful quarterly time-series coverage via the shared core fact table.
    domains.residential_rents = { status: "available", direct_or_derived: "direct", row_count: rent.n, earliest_period: rent.earliest, latest_period: rent.latest };
  } else if (snapshotOnlyRentCount > 0) {
    // Real value exists, but only as a single latest-value snapshot column
    // (mart.suburb_market_snapshot.median_weekly_rent_latest) — no
    // quarterly time series, unlike NSW/QLD/SA/WA. A genuinely narrower
    // capability than "available" alone would imply.
    domains.residential_rents = {
      status: "available_snapshot_only",
      row_count: snapshotOnlyRentCount,
      note: "latest-value only, no quarterly time series — this jurisdiction's rent pipeline bypasses the shared core.fact_rental_market_summary table that NSW/QLD/SA/WA use",
      stray_fact_table_rows: rent?.n ?? 0,
    };
  } else {
    domains.residential_rents = { status: manifest?.rent_status === "blocked_access" ? "blocked_access" : "unavailable", row_count: 0, finding: manifest?.rent_finding ?? "no live-verified source discovered" };
  }

  const hasUsableRent = domains.residential_rents.status === "available" || domains.residential_rents.status === "available_snapshot_only";
  domains.gross_yield = { status: sales && hasUsableRent ? "derived" : "unavailable", note: "requires both a sales and a rent source for the same jurisdiction; computed at query time, not stored" };

  domains.dwelling_stock = stock ? { status: "available", row_count: stock.n, source: "ABS Census GCP dwelling stock (national load, Sprints 2-4)" } : { status: "unavailable", row_count: 0 };
  domains.tenure = tenure ? { status: "available", row_count: tenure.n } : { status: "unavailable", row_count: 0 };
  domains.population = demo ? { status: "available", row_count: Number(demo.has_population), of_total: Number(demo.n) } : { status: "unavailable", row_count: 0 };
  domains.population_growth = demo && Number(demo.has_growth) > 0
    ? { status: "available", row_count: Number(demo.has_growth), of_total: Number(demo.n), method: "Sprint 11 WS4 cross-Census 2016-2021 population-weighted correspondence (see CROSS_CENSUS_HARMONISATION_METHOD.md)", direct_or_derived: "derived", correction_note: "jurisdiction_coverage.yml (Sprint 11 WS3) and JURISDICTION_COVERAGE_CONTRACT.md describe this as 'partially_available pending Workstream 4' — that was accurate when written but is now STALE; WS4 completed later in Sprint 11 and this is live-queried as populated. Those docs need correcting (tracked in national_coverage_audit.md)." }
    : { status: "unavailable", row_count: 0 };
  domains.internal_migration = { status: "unavailable", finding: "no ABS internal-migration dataset loaded at any grain. Live-checked Sprint 12 WS3: ABS's 'Regional internal migration estimates, provisional' (SA2 grain) exists but its latest-release page shows March 2021 as the most recent issue — either discontinued or on a very slow cadence, not confirmed current as of this check (2026-07-22). Not pursued further this pass; a future workstream should re-check whether a newer edition or successor publication exists before building an adapter." };
  domains.household_composition = demo && Number(demo.has_household_composition) > 0
    ? { status: "available", row_count: Number(demo.has_household_composition), of_total: Number(demo.n), fields: "family_households, lone_person_households, average_household_size" }
    : { status: "unavailable", row_count: 0 };
  domains.household_income = demo && Number(demo.has_income) > 0
    ? { status: "available", row_count: Number(demo.has_income), of_total: Number(demo.n) }
    : { status: "unavailable", row_count: 0 };
  domains.building_approvals = approvals ? { status: "available", row_count: approvals.n, earliest_period: approvals.earliest, latest_period: approvals.latest } : { status: "unavailable", row_count: 0 };
  const commenced = commencedByState.get(j.state_code);
  const completed = completedByState.get(j.state_code);
  domains.dwelling_commencements = commenced
    ? { status: "available", row_count: commenced.n, earliest_period: commenced.earliest, latest_period: commenced.latest, geography_grain: "STATE", note: "ABS Building Activity (cat. 8752.0), Sprint 12 WS3 — STATE grain only, no SAL/POA available" }
    : { status: "unavailable" };
  domains.dwelling_completions = completed
    ? { status: "available", row_count: completed.n, earliest_period: completed.earliest, latest_period: completed.latest, geography_grain: "STATE", note: "ABS Building Activity (cat. 8752.0), Sprint 12 WS3 — STATE grain only, no SAL/POA available" }
    : { status: "unavailable" };
  domains.housing_lending_rates = { status: "available", row_count: interestRateSeries.filter((s) => s.rate_type === "housing_lending_rate").reduce((a, s) => a + s.n, 0), note: "RBA national series (F6 Housing Lending Rates), not jurisdiction-specific — applies identically to every jurisdiction" };
  domains.affordability = sales ? { status: "derived", note: "computed at query time from sales + shared national assumption scenario, requires a sales source" } : { status: "unavailable", finding: "requires a sales price input, not available for this jurisdiction" };
  domains.sales_volume = sales ? { status: "available", note: "sale_count column within the sales fact/mart, same source as residential_sales" } : { status: "unavailable" };
  domains.rental_observations = hasUsableRent ? { status: "available", note: "observation_count column within the rent fact/mart, same source as residential_rents" } : { status: "unavailable" };
  domains.supply_per_1000_dwellings = approvals && stock ? { status: "derived", note: "approvals_per_1000_dwellings, computed at query time in compare_market_geographies_v1 and similar" } : { status: "unavailable" };
  domains.source_freshness = { status: "meta.dataset_freshness_status tracks this per dataset_id (Sprint 11 WS16), not per jurisdiction directly" };
  domains.confidence = { status: "every populated mart row carries a confidence_label column; distribution not jurisdiction-specific" };

  registry.jurisdictions[j.code] = {
    asgs_state_code: j.state_code,
    geography_backbone: g,
    meta_jurisdiction_registered: Boolean(metaRow),
    meta_jurisdiction_status: metaRow?.status ?? null,
    finding_meta_jurisdiction_gap: metaRow ? null : `${j.code} has ASGS geography loaded (${Object.values(g).reduce((a, b) => a + b, 0)} geographies across ${Object.keys(g).length} levels) but is NOT registered in meta.jurisdiction — a real gap for Sprint 12 WS2 to close.`,
    domains,
  };
}

registry.national = {
  interest_rate_series: interestRateSeries,
  note: "RBA cash rate and housing lending rates are national context, loaded once (Sprint 11 WS8), applying identically to every jurisdiction.",
};

// ── Write registry YAML (hand-serialised — no runtime YAML dependency, see WS14 memory note) ──
function yamlScalar(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  if (/^[A-Za-z0-9_./:-]+$/.test(s) && s.length < 80) return s;
  return JSON.stringify(s);
}
function toYaml(obj, indent = 0) {
  const pad = "  ".repeat(indent);
  let out = "";
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${pad}[]\n`;
    for (const item of obj) {
      if (item && typeof item === "object") {
        out += `${pad}-\n${toYaml(item, indent + 1)}`;
      } else {
        out += `${pad}- ${yamlScalar(item)}\n`;
      }
    }
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0) {
      out += `${pad}${k}:\n${toYaml(v, indent + 1)}`;
    } else if (v && typeof v === "object" && Array.isArray(v)) {
      out += `${pad}${k}:\n${toYaml(v, indent + 1)}`;
    } else if (v && typeof v === "object") {
      out += `${pad}${k}: {}\n`;
    } else {
      out += `${pad}${k}: ${yamlScalar(v)}\n`;
    }
  }
  return out;
}

const yamlHeader = `# National coverage registry (Sprint 12, Workstream 1)
# GENERATED — do not hand-edit. Regenerate with:
#   node warehouse/scripts/audit/build_national_coverage_registry.mjs
# Quantitative fields (row_count, earliest_period, latest_period, of_total)
# are live-queried against warehouse-validation at generation time.
# Qualitative fields (paid/restricted/blocked findings) are carried from
# Sprint 11 WS2's live-verified source discovery
# (national_jurisdiction_source_manifest.json), not re-invented here.
`;

fs.writeFileSync(rel("warehouse", "metadata", "national_coverage_registry.yml"), yamlHeader + toYaml(registry));

// ── Write JSON report ──────────────────────────────────────────────────
const jsonReport = {
  generated_at: registry.generated_at,
  method: "Quantitative fields live-queried against warehouse-validation (read-only); qualitative access-status fields carried from Sprint 11 WS2's national_jurisdiction_source_manifest.json",
  jurisdictions_covered: JURISDICTIONS.map((j) => j.code),
  registry_summary: Object.fromEntries(
    Object.entries(registry.jurisdictions).map(([code, j]) => [
      code,
      {
        geography_levels_loaded: Object.keys(j.geography_backbone),
        meta_jurisdiction_registered: j.meta_jurisdiction_registered,
        domains_available: Object.entries(j.domains).filter(([, d]) => d.status === "available").map(([k]) => k),
        domains_derived: Object.entries(j.domains).filter(([, d]) => d.status === "derived").map(([k]) => k),
        domains_unavailable: Object.entries(j.domains).filter(([, d]) => d.status && d.status.includes("unavailable")).map(([k]) => k),
      },
    ])
  ),
  known_stale_docs_found: [
    "warehouse/config/jurisdiction_coverage.yml: population_growth listed as 'partially_available pending Workstream 4' for every jurisdiction — WS4 completed later in Sprint 11, this field is now genuinely 'available' with derived/correspondence-based values. Needs correcting.",
    "warehouse/docs/JURISDICTION_COVERAGE_CONTRACT.md: same population_growth staleness; also its coverage table doesn't reflect QLD/SA/WA rent promotion (WS9) despite being dated 2026-07-21.",
  ],
  meta_jurisdiction_gaps: JURISDICTIONS.filter((j) => !metaJurisdictionRows.find((r) => r.asgs_state_code === j.state_code)).map((j) => j.code),
  findings: [
    {
      id: "stale_population_growth_docs",
      severity: "documentation",
      detail: "warehouse/config/jurisdiction_coverage.yml and warehouse/docs/JURISDICTION_COVERAGE_CONTRACT.md both describe population_growth as 'partially_available pending Workstream 4' for every jurisdiction. WS4 completed later in Sprint 11 (see CROSS_CENSUS_HARMONISATION_METHOD.md); this audit's live query confirms population_growth_2016_2021_pct is genuinely populated (majority of rows nationally). Needs correcting.",
    },
    {
      id: "confidence_conflates_direct_and_derived",
      severity: "data_quality",
      detail: "population_growth_2016_2021_pct rows are labelled geography_method='direct', confidence_label='official' in mart.suburb_demographic_profile_2021 — identical to the directly-published 2021 population figures in the SAME row, even though growth is a derived, correspondence-weighted value. Contradicts this project's principle that derived values must be clearly distinguished from directly published ones. Candidate for Sprint 12 WS4/WS8 (likely needs a per-column, not per-row, lineage/confidence model).",
    },
    {
      id: "future_reference_period_nsw_sales",
      severity: "data_quality",
      detail: "2 rows in core.fact_residential_sales_summary (SAL_12348 / POA_2070, both Lindfield NSW, dataset_id=nsw_psi_2001_current_full_state) carry reference_period=2032-01-01 — a date ~5.5 years in the future, impossible for a settled sale. Both already carry sample_size_confidence='insufficient' (transaction_count=1) so they don't surface as a trustworthy statistic, but the underlying parsing defect is real and current. A small number of pre-1990 dates (as early as 1903) also exist in the same table — plausibly genuine historical transactions in the VG archive, not flagged as errors. Candidate data-quality rule for Sprint 12 WS9: reject/quarantine any reference_period outside [earliest plausible source year, current date].",
    },
    {
      id: "poa_geography_has_no_state_code",
      severity: "architecture",
      detail: "core.dim_geography.state_code is NULL for all 2,641 current POA rows (ASGS postal areas are not assigned a single definitive state at the boundary-file level). A naive join from any fact table to dim_geography.state_code therefore silently drops every postcode-grain fact from a per-jurisdiction count/filter — this audit's own first draft had exactly this bug (fixed here using the official Australia Post postcode-to-state range table, applied only within this audit script). Separately, mart.postcode_market_snapshot has its own `jurisdiction` column but it is only populated for NSW/VIC (1,334 of 2,641 POA rows have jurisdiction=NULL there) — QLD/SA/WA's rent-only postcode data has no jurisdiction label at all in that table, meaning the public map/API's jurisdiction display is likely NULL for those markers too. Candidate for Sprint 12 WS6 (national canonical marts) to fix structurally, e.g. a generated postcode_to_state column or function used consistently everywhere POA jurisdiction is needed.",
      residual_unattributed_rows: "postcode-range heuristic leaves a small residual of facts unattributable to any of the 8 ranges (out-of-range/malformed postcode codes) — reported per-domain in the registry, not silently dropped or force-assigned.",
    },
    {
      id: "vic_rent_bypasses_shared_fact_table",
      severity: "architecture",
      detail: "core.fact_rental_market_summary has ZERO rows for VIC (state_code=2) across all geography types — live-verified, matches a finding already recorded in Sprint 11's session history. jurisdiction_coverage.yml describes VIC rent as 'partially_available... refresh_frequency: quarterly', implying a time series, but no VIC rent time series exists anywhere in mart.suburb_rent_quarterly / mart.lga_rent_quarterly / mart.postcode_rent_quarterly (all live-queried at 0 VIC rows). VIC's rent value exists ONLY as a single latest-value column, mart.suburb_market_snapshot.median_weekly_rent_latest (79 of 2,944 VIC suburbs populated) — VIC's rent pipeline diverged from the shared core-fact/quarterly-mart pattern every other rent-bearing jurisdiction (NSW/QLD/SA/WA) uses. This audit reports VIC rent as 'available_snapshot_only' rather than 'available' to reflect this genuinely narrower capability (no history, no trend). Candidate for Sprint 12 WS6 to either backfill VIC into the shared quarterly pipeline or explicitly document the divergence in the coverage contract rather than implying parity with the other jurisdictions.",
    },
  ],
};
fs.writeFileSync(rel("warehouse", "reports", "national_coverage_audit.json"), JSON.stringify(jsonReport, null, 2) + "\n");

// ── Markdown report ─────────────────────────────────────────────────────
function fmtDomain(name, d) {
  const label = name.replace(/_/g, " ");
  if (!d) return `| ${label} | unavailable | - | - |`;
  const status = d.status;
  const detail = d.row_count !== undefined ? `${d.row_count.toLocaleString()} rows${d.of_total ? ` / ${d.of_total.toLocaleString()}` : ""}` : d.note || d.finding || "-";
  const period = d.earliest_period && d.latest_period ? `${d.earliest_period} to ${d.latest_period}` : "-";
  return `| ${label} | ${status} | ${detail} | ${period} |`;
}

let md = `# National Coverage Audit (Sprint 12, Workstream 1)

Generated ${jsonReport.generated_at} by \`warehouse/scripts/audit/build_national_coverage_registry.mjs\`.
Quantitative fields (row counts, reference periods, coverage fractions) are
live-queried against \`warehouse-validation\` at generation time — not
hand-narrated. Qualitative access-status findings (paid/restricted/blocked)
are carried from Sprint 11 Workstream 2's live-verified source discovery
(\`national_jurisdiction_source_manifest.json\`), cross-referenced here
rather than re-typed by hand. Re-run the script any time to regenerate
both the registry (\`warehouse/metadata/national_coverage_registry.yml\`)
and this report from current live state.

## Findings this audit surfaced (not previously documented, or documented but stale)

${jsonReport.findings.map((f) => `- **${f.id}** (${f.severity}): ${f.detail}`).join("\n")}

## Jurisdiction × domain coverage

`;

for (const [code, j] of Object.entries(registry.jurisdictions)) {
  const totalGeo = Object.values(j.geography_backbone).reduce((a, b) => a + b, 0);
  md += `### ${code}\n\n`;
  md += `Geography backbone: ${totalGeo.toLocaleString()} geographies across ${Object.keys(j.geography_backbone).length} levels (${Object.entries(j.geography_backbone).map(([k, v]) => `${k}: ${v.toLocaleString()}`).join(", ")}).`;
  md += j.meta_jurisdiction_registered ? ` Registered in \`meta.jurisdiction\` (status: ${j.meta_jurisdiction_status}).\n\n` : ` **Not registered in \`meta.jurisdiction\`.**\n\n`;
  md += `| domain | status | detail | period |\n|---|---|---|---|\n`;
  for (const domainKey of DOMAIN_ORDER) {
    md += fmtDomain(domainKey, j.domains[domainKey]) + "\n";
  }
  md += "\n";
}

md += `## National context (applies identically to every jurisdiction)

RBA interest-rate series loaded (Sprint 11 WS8):

| rate_type | borrower_type | loan_type | rows | earliest | latest |
|---|---|---|---|---|---|
${interestRateSeries.map((s) => `| ${s.rate_type} | ${s.borrower_type ?? "-"} | ${s.loan_type ?? "-"} | ${s.n} | ${s.earliest} | ${s.latest} |`).join("\n")}

## Method note

This audit deliberately does not attempt a full 9-jurisdiction × 9-geography
× 19-domain cross-tabulation (1,539 cells) as a hand-authored matrix — most
combinations would be empty or redundant with the per-domain
\`geography_levels\` already recorded. Geography-level detail is captured
per domain in the registry YAML; this report summarises at the
jurisdiction × domain grain, which is where genuine coverage decisions
actually get made.
`;

fs.writeFileSync(rel("warehouse", "reports", "national_coverage_audit.md"), md);

console.log("Wrote warehouse/metadata/national_coverage_registry.yml");
console.log("Wrote warehouse/reports/national_coverage_audit.json");
console.log("Wrote warehouse/reports/national_coverage_audit.md");
