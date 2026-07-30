# Sprint 18 — Three-Way Migration Reconciliation

Date: 2026-07-31
Branch: `feature/sprint18-production-warehouse-bootstrap`

Method: direct catalog inspection (`pg_catalog`/`information_schema` queries against
the live Production and warehouse-validation databases via Supabase MCP), not
migration-ledger-name comparison alone.

## A. Repository (`supabase/migrations/`)

46 files, `001`–`046`, contiguous, no gaps.

## B. Production (`oshquaxsloolqucwvigc`)

Ledger: `remote_schema` (baseline snapshot, untracked by name) + `037`–`044` +
`045_sprint17_preferences_feedback_controls` (applied this sprint).

**Confirmed via direct catalog inspection:**
- Core app tables (`property_reports`, `strategy_reports`, `watchlist_items`,
  `user_entitlements`, etc.) already exist — these are `001`/`002`'s effect,
  folded into the untracked `remote_schema` baseline.
- **No `core`, `mart`, `staging`, or `meta` schema exists at all.** Migrations
  `003`–`036` (the entire warehouse/research layer) have never been applied.
- Migration `046` is absent, consistent with the schema gap above (nothing
  to grant on).

## C. warehouse-validation (`lzonauinzatmtytyoems`, a branch of the Production project)

Ledger: `remote_schema` + `003`–`036` (with several extra branch-only entries:
`013_fix_geography_code`, `data_refresh_operations_public_view`,
`020_market_map_markers_fix`/`fix2`/`fix3`) + `042`–`044` +
**`045_fix_rls_initplan_perf_042_043_044`** + `037`–`041` + `045_sprint17_...` +
`046_research_api_grant_hardening`.

**Confirmed via direct catalog inspection:** the warehouse schema is fully built
and **already carries substantial real, loaded data** — `core.dim_geography`
(101,215 rows), `mart.suburb_market_snapshot` (15,334 rows),
`mart.postcode_market_snapshot` (2,641 rows), sales/rent/census/approvals facts
in the tens-to-hundreds of thousands of rows each, all with rich per-table
documentation of source, grain, and NULL-handling philosophy. This is not a
schema-only stub — Sprint 1–12's ETL work already populated it, which is why
every Research Hub check has passed throughout this project's UAT history.

## Investigation: `045_fix_rls_initplan_perf_042_043_044`

Read the exact applied SQL directly from
`warehouse-validation`'s `supabase_migrations.schema_migrations` table. It
re-creates the `research_copilot_queries`/`user_onboarding_preferences`/
`user_feedback` owner policies using the `(select auth.uid())` InitPlan-optimised
predicate — "no behavioural change, same predicate, same isolation guarantee"
per its own comment.

**Finding: obsolete for any fresh deployment.** The repository's own `042`,
`043`, `044` files already create these exact policies in the optimised form
directly (confirmed by reading the files). Directly confirmed Production's
*actual* policy definitions via `pg_policies` — they already use
`(SELECT auth.uid())`, proving Production got the fix "for free" by applying
the current repo files, never passing through the unoptimised intermediate
state this migration exists to correct. **Classification: branch-only historical
fix, repository already covers it, do not carry forward, no conflict with
Production's actual `045`** (different migration entirely — Supabase versions
by timestamp, not the repo's local file-number convention, so there is no real
collision risk).

## Security finding surfaced by the Supabase advisor (unprompted, tool-flagged "critical")

53 tables across `core`/`mart`/`staging`/`meta` on warehouse-validation have RLS
disabled. **Verified this is not currently exploitable via the public API**:
`has_schema_privilege('anon'/'authenticated', '<schema>', 'USAGE')` returns
`false` for all four schemas — the schema-level `REVOKE` (migration `014`/`023`)
independently blocks all access regardless of RLS. **Also verified this is a
pre-existing repository design decision, not branch drift** — no migration file
`001`–`036` ever enables RLS on these schemas; the intended access model has
always been "no direct API exposure to raw tables, only curated views get
narrow grants." Not an active vulnerability today, but a defense-in-depth gap
worth closing when the Production delivery migrations are written, so a future
grant mistake doesn't become a live incident.

## Phase 3 decision: schema-delivery strategy

**Selected: curated forward migrations from current Production state — the
brief's own preferred default** (not native branch merge), because independent
evidence points against the merge:

- The branch has genuinely diverged (obsolete fix migration, non-sequential
  historical application order, several undocumented `_fix`/`_fix2`/`_fix3`
  patches folded in ad hoc).
- A native merge would import the *entire* branch schema (staging tables,
  internal meta tables) rather than the minimum launchable Research/API
  contract — less reviewable, larger blast radius.
- It would also carry the RLS gap forward unexamined, where a curated
  approach lets it be fixed as part of the same delivery.
- The repository's own `003`–`036` files are already the reviewable, tested
  source of truth — the existing `clean-migration-replay` CI job already
  proves they apply cleanly in sequence (this was exercised repeatedly during
  Sprint 17.5 closure). No new migration-generation-from-diff tooling is
  needed; the delivery vehicle is the **existing, already-verified `003`–`036`
  files themselves**, applied to Production in their current form, plus one
  new small additive migration for the RLS defense-in-depth fix.

This is a materially smaller and safer task than "generate a schema diff from
scratch" — the correct migrations already exist and are already proven.
