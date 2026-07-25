# Sprint 10 Final Report

**Australia Residential Property Intelligence V2 — NSW Reconciliation, Victoria Expansion, Cross-State Comparison and Automated Refresh**

Generated: 2026-07-21

## Executive summary

NSW's Sprint 9 dwelling-classification drift (18,712 records) was fully
reconciled and independently verified before any Victoria work began, per
the sprint's blocking requirement. A documented state-adapter architecture
and canonical data contracts now govern both states. Victoria's
residential sales (VPSR, suburb grain) and rental market (Homes Victoria,
dual suburb/LGA grain) were sourced, geography-mapped (95% suburb-match
rate for sales, zero fuzzy matching), built into local stores, and
promoted to the branch. Victoria's supply/demographics/affordability data
was confirmed already-national from prior sprints — no re-ingestion
needed. A shared multi-state schema, a 16-metric national canonical
registry, and a security-tested cross-state comparison API were
delivered. A new explore/compare UI and a data-freshness observability
page were built and browser-tested against real branch data. A refresh
orchestration framework (dry-run by default, production hard-refused,
proven live) closes out the automation requirement without enabling any
schedule.

**All 16 phases completed.** Production was never touched. The Supabase
branch was never merged. No raw data files were committed. No paid
infrastructure was increased.

## Files and commits

7 commits, 86 files changed, 21,625 insertions, on
`feature/deal-analyser-budget-2026`:

1. `05fee3b` — Phases 0-2: NSW reconciliation + state-adapter architecture
2. `4012937` — Phases 3-6: Victoria source discovery, geography mapping, sales+rents local stores
3. `21f8008` — Phases 7-9: VIC supply/demographics confirmation, multi-state schema, branch load
4. `18d9ede` — Phases 10-11: national metric registry + cross-state comparison API
5. `1f9115c` — Phases 12-13 (partial): multi-state research UI + refresh registry
6. `2c4394e` — Phases 13-14: refresh orchestration + freshness observability
7. `7e8ccac` — Phase 15: VIC contract tests, national metric validation, lint cleanup

## Phase-by-phase results

### Phase 1 — NSW reconciliation (blocking)

18,712 records reclassified, 4,680,129 total residential transactions
unchanged, 252,412 branch rows replaced via safe UPSERT, all validation
gates zero, 3 exact-match spot checks. See
`nsw_sales_reconciliation_report.{json,md}`.

### Phase 2 — State-adapter architecture

`STATE_ADAPTER_ARCHITECTURE.md`, `CANONICAL_PROPERTY_DATA_CONTRACTS.md`,
`jurisdictions.yml`, `lib/warehouse/contracts.ts` (10 tests, NSW+VIC
fixtures). NSW's working scripts were documented, not rewritten.

### Phase 3 — Victoria source discovery

VPSR (Valuer-General Victoria, sales) and Homes Victoria (rent) selected.
CAV RTBA microdata and REIV data rejected (documented reasons). Cloudflare
challenge on VPSR's file host resolved via the established headed-browser
technique. ASGS geography, Census, Building Approvals, RBA rates confirmed
already-national — zero new ingestion needed for those.

### Phase 4 — Geography mapping

785 distinct VPSR localities: 579 direct + 167 alias matches (95%), 0
ambiguous, 39 quarantined unresolved. Key finding: VPSR uses standard
single-suburb names (unlike Homes Victoria's custom multi-suburb rent
groupings), enabling suburb-grain VIC sales.

### Phases 5-6 — Victoria local stores

- Sales: 7,145 summary rows across 785 localities, 3 dwelling types, all
  validation gates pass.
- Rent: 150,709 rows, dual grain (101,399 suburb + 49,310 LGA fallback for
  the ~50% of localities that are genuine multi-suburb groupings), all
  gates pass.

### Phase 7 — Supply/demographics/affordability

Verification only — VIC's dwelling stock (152,192 rows), tenure (114,144
rows), and building approvals (20,358 rows) were already national. The
affordability scenario (`meta.metric_assumption`) has no jurisdiction
column, confirmed identical methodology across states by construction.

### Phases 8-9 — Migrations and branch load

Migrations 015-017 extend existing canonical tables with a `jurisdiction`
column rather than creating VIC-specific duplicate tables. VIC branch
load: 741 suburb snapshot rows, 6,727 sales + 8,130 rent + 706 yield +
2,944 approvals timeseries rows, SAL grain only (documented scope), all
gates pass.

### National snapshot/timeseries coverage (both states)

| table | NSW | VIC |
|---|---|---|
| suburb_market_snapshot | 4,542 | 2,944 |
| postcode_market_snapshot | 613 | 694 |
| suburb_market_timeseries | 61,603 | 18,507 |
| postcode_market_timeseries | 23,150 | 0 |

### Branch storage

2,169 MB → 2,359 MB (+190 MB), well within the 300 MB capacity budget set
in Phase 0.

### Phases 10-11 — Metrics and comparison API

16-metric national registry (`market_metrics.yml`). 4 new SECURITY
DEFINER interfaces (`search_market_geographies_v2`,
`get_market_snapshot_v2`, `compare_market_geographies_v1`,
`get_market_timeseries_v2`). 7/7 security tests pass: anon can execute,
cannot read/write `mart.*` or `meta.jurisdiction` directly, row limits
and array-length bounds enforced server-side, SQL-injection-shaped input
treated as a literal.

### Phase 12 — Multi-state UI

New `MULTI_STATE_RESEARCH_ENABLED` flag gates `/research/explore` and
`/research/compare`. Existing suburb/postcode routes upgraded in place to
v2 queries (a planned `[stateCode]/[geographyCode]` route was dropped —
Next.js forbids two differently-named dynamic segments at one URL
position; documented in `multi_state_research_ui_report.md`). 9/9 browser
tests pass against real branch data, including a live cross-state
(NSW+VIC) comparison with correctly non-aligned periods shown per
geography.

### Phases 13-14 — Refresh orchestration and freshness

No schedule enabled. `plan_refresh.mjs`, `run_refresh.mjs`,
`check_freshness.mjs`, `generate_refresh_report.mjs` all run live against
the branch this sprint; production-target rejection proven live. A real
bug (plan/dry-run runs falsely counting as evidence of a refresh) was
found via testing and fixed. `/research/data-status` reads a new
`public.v_dataset_freshness_v1` view, browser-tested with 0 console
errors.

### Phases 15-16 — Testing and final validation

- 48/48 unit tests pass (+7 from session start).
- `tsc --noEmit` fully clean (also fixed 2 pre-existing errors).
- `npm run lint`: 8 errors / 6 warnings, identical to the pre-existing
  error baseline; all 6 warnings confirmed pre-existing in untouched
  files (verified via `git log` per file); 9 new warnings this session's
  own scripts introduced were found and fixed.
- `npm run build` succeeds.
- `npm run warehouse:check` passes — no raw/boundary/archive files
  tracked by git.
- Production schemas reconfirmed zero via MCP `list_tables`.

## Sprint completion checklist

| item | result |
|---|---|
| Production touched | **NO** |
| Branch merged | **NO** |
| Production deployment | **NO** |
| Raw files committed | **NO** |
| Paid infrastructure increased | **NO** |
| Feature flags disabled by default | YES |
| NSW/VIC same canonical contracts | YES |
| Cross-state comparison works | YES |
| Automated refresh planning exists | YES |
| Freshness monitoring exists | YES |
| Anonymous read-only access safe | YES |

## Recommended next step

Request explicit human approval before any Supabase branch merge or
production deployment — this sprint deliberately stopped short of both,
per its non-negotiable safety rules. Before seeking that approval,
consider (not urgent, not blocking):

1. Re-verify NSW's `gross_yield` methodology against its own
   `yield_sale_period_used`/`yield_rent_period_used` columns specifically
   — this sprint's metric validation spot-checked VIC's formula exactly,
   but verified NSW's by design reasoning rather than a fresh live
   recompute against those specific columns.
2. Decide whether the ~50% VIC rent locality coverage gap (79 of 158
   suburb-grain localities; the rest use the LGA fallback) is acceptable
   for launch, or whether further ASGS correspondence work should resolve
   more of Homes Victoria's custom suburb groupings first.
3. Decide whether to invest in chart visualisation — `recharts` is
   installed but unused; Phase 12 deferred this given the time budget.
