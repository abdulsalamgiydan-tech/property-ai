# Sprint 11 Final Report — National Warehouse Expansion & Operating System Hardening

Branch: `feature/australia-property-intelligence-v3`. 35 commits since Sprint
10's close (`599beae`), 128 files changed, +38,310/-41 lines. All 23
workstreams (WS0-22) complete.

## Executive summary

Sprint 11 took the multi-state (NSW+VIC) warehouse Sprint 10 delivered and
did two things: (1) extended real coverage — QLD/SA/WA rent, SA2/LGA
dwelling-stock marts, cross-Census 2016-2021 population harmonisation, NSW
sales back to 1990 — and (2) turned the whole thing from a set of
individually-run scripts into an actual **operating system**: one
orchestrator across all ~20 datasets with dependency ordering, locking and
resumability (WS14); a documented (not automated, no paid infrastructure)
refresh schedule (WS15); an operations console showing freshness, refresh
history and storage (WS16); a live security and performance audit that
found and fixed two real issues (WS17); reviewed feature flags (WS18); 19
new automated tests (WS19); a migration audit that found and fixed a real
replay bug (WS20); an operations runbook (WS21).

Production was never touched, at any point (re-verified live at the end of
this workstream: `oshquaxsloolqucwvigc` has zero `core`/`mart`/`meta`/
`staging` schemas). The validation branch (`lzonauinzatmtytyoems`) sits at
2,634.1 MB — 58.5% of the internal 4,500 MB working ceiling this project
has held itself to (the branch's actual Supabase Pro allocation is
8,192 MB).

## Workstreams completed

| WS | title | key artifact(s) |
|---|---|---|
| 0 | Sprint 10 handover, new branch | `41dbcc0` |
| 1 | National capacity/cost/architecture audit | `b902c9d` |
| 2 | National source discovery (QLD/SA/WA/TAS/ACT/NT) | `66215e5` |
| 3 | National coverage contract | `72a71cb`, `JURISDICTION_COVERAGE_CONTRACT.md` |
| 4 | Cross-Census 2016-2021 harmonisation | `2746fb4`, `CROSS_CENSUS_HARMONISATION_METHOD.md` |
| 5 | National population-demand layer (SA2 ERP) | `5363498` |
| 6 | QLD/SA/WA rent adapters, TAS verification | `0fd8a1d`, `87b34bd`, `b9dce51` |
| 7 | Local-first national data lake catalogue | `7d76e91` |
| 8 | NSW sales historical backfill (1990-2000) | `8076643`, `NSW_SALES_ARCHIVE_1990_2000_METHOD.md` |
| 9 | Canonical marts: QLD/SA/WA rent promoted, SA2/LGA dwelling stock | `1926c35`, `d6a2fbb`, migrations 018-019 |
| 10 | Transparent research indicators | `137e0aa`, `RESEARCH_INDICATOR_DEFINITIONS.md` |
| 11 | National map explorer (`/research/map`) | `d9dfed5`, `5fb3638`, migration 020 |
| 12 | Advanced comparison (2-10 geographies) | `a3a5874`, migration 021 |
| 13 | Report export (CSV/JSON/print) | `d778478` |
| 14 | Incremental refresh engine v2 | `baac3fa` |
| 15 | Refresh schedule design (no paid automation) | `20b248e` |
| 16 | Data operations console expansion | `d26ff08`, migration 022 |
| 17 | DB security audit + performance hardening | `5018439`, migrations 023-024 |
| 18 | Feature flags and preview readiness | `a0bc68d` |
| 19 | Comprehensive testing (19 new tests) | `ad08910` |
| 20 | Migration audit — found and fixed a real bug | `17831c2` |
| 21 | Operations runbook | `5d03fe4` |
| 22 | Final review, this report | `70b1711`, this commit |

## Real bugs found and fixed this sprint (not just reported)

1. **Migration 020 replay bug** (WS20): the checked-in
   `020_market_map_markers.sql` was missing the `with` keyword before its
   first CTE — would fail with a SQL syntax error if replayed against a
   clean database, even though the live branch worked (fixed
   interactively during WS11 via 3 follow-up migrations never
   back-ported into the file). Fixed, re-verified live by re-applying the
   corrected file and confirming real query results.
2. **Excess view grants** (WS17): every `public.v_*` warehouse view
   carried unintended `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` grants to
   `anon`/`authenticated`, inherited from a Supabase platform default —
   inert in practice but fixed via explicit `REVOKE` (migration 023).
3. **Map viewport query performance** (WS17): 1,059.8ms, the clear
   outlier among 7 measured public interfaces. Root-caused to a missing
   partial index; fixed (migration 024); re-measured live at 180.8ms
   (5.86x speedup).
4. **Two live-testing bugs from WS11** (carried forward from the prior
   session, listed here for completeness): `has_full_snapshot` wrongly
   `true` for empty geographies, and rent fallback picking a NULL "latest"
   quarter instead of the latest quarter with real data — both fixed and
   verified live before WS11 was marked complete.

## Testing

72 automated tests across 6 files (was 53 at Sprint 11's start), all
passing:
- `warehouse/config/refresh_registry.test.ts` (6): structural integrity +
  drift detection (every referenced script path must exist on disk).
- `warehouse/scripts/orchestration/refresh_engine_v2.test.ts` (12, new):
  real subprocess integration tests of every safety gate — production
  rejection, lock contention/staleness, resumability, argument validation
  — with zero real downloads or DB writes.
- `lib/warehouse/contracts.test.ts` (10), `lib/warehouse/affordability.test.ts`
  (17), `lib/warehouse/env.test.ts` (14, +8 this sprint for WS18's flags),
  `lib/tax/budget2026.test.ts` (13, pre-existing, unrelated to this sprint).

`npm run warehouse:check`, `npm run build` both pass clean. One genuinely
new warning (`localOnly` unused in `refresh_engine_v2.mjs`) was found and
fixed in WS22.

**Correction, added after this report was first written**: this report
originally described `npm run lint`'s 8 pre-existing errors (in
`components/analyse`, `components/compare`, `components/reports`,
`components/strategy` — last touched by `ebc6552`, an ancestor commit
predating this sprint) as "acceptable" on the reasoning that they were
unrelated to and unchanged by Sprint 11 work. **That reasoning was wrong
for CI purposes.** GitHub Actions checks exit code, not commit
provenance — `npm run lint` exited 1 with no `continue-on-error`, so
every CI run on this branch from WS15 (when the workflow was first added)
through this report's own commit (`a713931`) actually **failed**,
contradicting this report's implicit "all checks pass" framing. The user
caught this contradiction directly from the GitHub Actions UI. All 8
errors were properly fixed (not suppressed) and CI is now green — full
details, evidence, and the fix in
`github_actions_failure_diagnosis.{md,json}` and
`github_actions_ci_reconciliation.{md,json}`. Sprint 11 should be
considered fully complete only as of the green run referenced in the
reconciliation report, not as of this report's original commit.

## Migrations

11 new migrations this sprint (014 was Sprint 9; 015-017 Sprint 10;
018-024 this sprint): `018_lga_rent_quarterly`, `019_sa2_lga_dwelling_stock`,
`020_market_map_markers` (fixed in WS20), `021_compare_up_to_10`,
`022_data_operations_console`, `023_revoke_excess_view_grants`,
`024_rent_mart_performance_indexes`. All applied live via Supabase MCP,
all confirmed present via `list_migrations`, all (except 020's pre-fix
state) diffed line-for-line against their live definitions and matched
exactly.

## Coverage as of Sprint 11's close

- **Full snapshot marts (sale price + rent + demographics)**: NSW, VIC.
- **Rent-only (promoted to branch)**: QLD, SA, WA.
- **Dwelling-stock marts**: SA2 (2,454 rows), LGA (547 rows), national.
- **Population-demand layer**: SA2 ERP, cross-Census 2016-2021 harmonised.
- **Historical sales**: NSW back to 1990.
- **TAS/ACT/NT**: source-discovered (WS2/WS6) but not yet loaded — real
  coverage gap, explicitly not fabricated, deferred to Sprint 12 Part B.

## Confirmations

- Production (`oshquaxsloolqucwvigc`): **NOT touched** — zero `core`/
  `mart`/`meta`/`staging` schemas, re-verified live at the end of this
  sprint.
- Production: **NOT deployed to**, **NOT merged into** — this branch has
  not been merged; no merge command was ever run.
- Raw data files: **NOT committed** — `warehouse:check`'s git-tracked-file
  scan confirmed clean at every commit this sprint.
- Paid infrastructure: **NOT added** — no new Vercel/Supabase paid tier,
  no new external API subscription. Feature flags added this sprint
  (WS18) are environment-variable gates on existing infrastructure only.

## Known limitations (honest, not hidden)

- DB-level behaviour (response limits, grants, NULL semantics, export
  correctness) is verified via live Supabase MCP audits, not repeatable
  CI tests — CI has no database credentials for this project by
  deliberate design (see `sprint11_ws19_test_coverage_report.md`).
- TAS/ACT/NT have zero loaded market data — sources are discovered and
  documented, not blocked, but genuinely not built yet.
- `get_market_timeseries_v1`/`_v2` have no enforced row cap (self-limiting
  in practice, flagged as a recommendation in WS17, not fixed).
- The 46 unindexed-foreign-key / 26 unused-index performance advisor
  findings on internal (zero-grant) tables were reviewed and deliberately
  not acted on (WS20) — consistent with WS17's decision to focus
  performance work on measured public-facing interfaces.

## PR status

**Not opened.** The `gh` CLI is not installed/available in this
environment (confirmed: `gh: command not found` in both Bash and
PowerShell). The branch is pushed and up to date at
`origin/feature/australia-property-intelligence-v3`
(commit `70b1711`). To open the draft PR, either install/authenticate
`gh` and run:

```bash
gh pr create --draft --base main --head feature/australia-property-intelligence-v3 \
  --title "Sprint 11: National warehouse expansion + operating-system hardening" \
  --body-file warehouse/reports/sprint11_final_report.md
```

or open one via the GitHub web UI comparing `main` against this branch —
no code changes are needed first, this is purely a missing local tool.

## Recommended next human decision

Sprint 11 is functionally complete and internally consistent (tests,
build, warehouse:check all pass; production confirmed untouched). The
next decision is not technical: whether to (a) open the draft PR for
human review before any further work, or (b) proceed directly into
Sprint 12 (national coverage closure — TAS/ACT/NT, Scenario Lab, data
lineage, automated data-quality monitoring, and the rest of that much
larger scope) on a new branch as originally planned. Given Sprint 12's
scope is substantially larger than Sprint 11's, a human checkpoint before
committing to it is the safer default.
