# Sprint 15 — Migration Validation (042, 043, 044)

## Method

Every claim below was verified by actually applying the migrations to
a confirmed non-production database (the `warehouse-validation`
Supabase branch, `lzonauinzatmtytyoems` — see
`sprint15_baseline_audit.md` for how its non-production status and
provenance were confirmed) and querying the resulting live schema —
not by re-reading the SQL text and assuming correctness. Static tests
(the `.test.ts` files alongside each migration) were never sufficient
on their own; this pass proves it (see the RLS performance finding
below, which no static test could have caught).

## Target confirmation (before anything was applied)

1. `list_projects` — confirmed `oshquaxsloolqucwvigc` is the only
   relevant project, and it is production.
2. `list_branches` on that project — confirmed `warehouse-validation`
   (`lzonauinzatmtytyoems`) is a distinct, non-default branch,
   `ACTIVE_HEALTHY`, already provisioned (applying migrations to an
   already-running branch incurs no new cost, unlike creating a new
   branch).
3. `execute_sql` — confirmed `auth.users` exists on that branch (0
   rows, no real user data) before applying anything that foreign-keys
   to it.

Only after all three checks passed were any migrations applied.

## Per-migration review

### 042 — `research_copilot_queries`

- **Safety**: `create table if not exists`, idempotent. No destructive
  DDL. FK to `auth.users(id) on delete cascade` — correct, prevents
  orphaned rows and cleans up automatically on user deletion.
- **`geography_id uuid not null` has no FK constraint** — reviewed and
  confirmed this is a deliberate, correct design choice, not an
  oversight: `geography_id` references a row in the separate warehouse
  Supabase project, and Postgres cannot enforce a foreign key across
  two different database instances. Application-layer validation
  (via `resolveGeographyByCode()` before insert) is the only available
  enforcement, and that's already how the app code works.
- **Indexes**: `(user_id, created_at desc)` correctly supports the
  rate-limit query pattern used by `countRecentQueries()` (filter by
  `user_id`, range on `created_at`, ordered).
- **RLS**: select-own + insert-own only, no update/delete — correct
  for an append-only audit/rate-limit log.
- **Clean-database reproducibility**: applies cleanly to a database
  with only `auth.users` present — no dependency on any other
  migration in this repo, confirmed by inspection and by successfully
  applying it to a branch that was missing migrations 037-041.
- **Rollback**: `drop table if exists public.research_copilot_queries;`
  (see `sprint15_rollback_runbook.md`).

### 043 — `user_onboarding_preferences`

- **Safety**: same idempotent pattern. `user_id uuid primary key
  references auth.users(id) on delete cascade` — PK doubles as the
  uniqueness constraint, correct for a one-row-per-user table.
- **Indexes**: none beyond the primary key — correct, since every
  query pattern (`getOnboardingStatus`, `saveOnboardingPreferences`)
  filters/upserts by `user_id`, already covered by the PK index.
- **RLS**: full 4-op (select/insert/update/delete), all own-row only —
  correct for a mutable preferences table (a user can update or delete
  their own onboarding record).
- **Clean-database reproducibility**: same as above, verified.
- **Rollback**: `drop table if exists public.user_onboarding_preferences;`

### 044 — `user_feedback`

- **Safety**: same idempotent pattern, same FK/cascade correctness.
- **Indexes**: `(user_id, created_at desc)` — correct, matches the
  admin page's query pattern (`order by created_at desc`) and any
  future per-user feedback history view.
- **RLS**: select-own + insert-own only — correct, feedback is meant
  to be immutable once submitted.
- **Clean-database reproducibility**: verified.
- **Rollback**: `drop table if exists public.user_feedback;`

## A real issue found — and fixed — by live verification

Running Supabase's own performance advisor (`get_advisors`, type
`performance`) against the applied migrations found a genuine issue no
static test could catch: all three migrations' RLS policies used the
plain `auth.uid() = user_id` predicate, which Postgres re-evaluates on
**every row** of a query rather than once per statement — a documented
Postgres/Supabase RLS performance anti-pattern
(`auth_rls_initplan` lint).

**Fix applied**: rewrote every policy predicate to
`(select auth.uid()) = user_id` — mathematically identical isolation
guarantee (still resolves to the same boolean per row), but Postgres
can now evaluate the subquery once (an InitPlan) and reuse the result,
instead of calling the function fresh for every row scanned.

**Verification of the fix**: re-applied the corrected policies to the
`warehouse-validation` branch, re-ran `get_advisors` (performance), and
confirmed **zero `auth_rls_initplan` warnings remain on any of the
three new tables**. The only remaining advisor notices for these
tables are informational "index not yet used" lints — expected and
benign, since the tables have zero rows and no queries have run
against them yet.

The corresponding `.sql` files in the repo and their `.test.ts`
assertions were updated to match (commit `b854284`), and the static
RLS checker (`check_rls_policies.mjs`) was updated to accept both the
wrapped and unwrapped forms as valid going forward.

**Side-finding, explicitly not acted on**: the same
`auth_rls_initplan` pattern exists in **7 other tables already live in
production** from earlier migrations (`waitlist`,
`portfolio_properties`, `property_comparisons`, `property_reports`,
`strategy_reports`, `watchlist_items`, `strategy_generations`). Fixing
those would mean modifying already-live production RLS policies —
explicitly out of scope for this migration-validation pass and not
touched, per the standing guardrail against production changes without
explicit approval. Flagged in `sprint15_go_no_go.md` as a candidate for
a future, separately-approved workstream.

## Security re-verification after the fix

`get_advisors` (type `security`) run against the branch after all
three migrations (with the fix) were applied: **zero new findings**
attributable to `research_copilot_queries`, `user_onboarding_preferences`,
or `user_feedback`. Every finding in the report belongs to pre-existing
warehouse-schema views/functions (`v_suburb_market_snapshot_v1`,
`search_market_geographies_v2`, etc.) unrelated to this sprint's work.

## Schema verification (live, via `list_tables`)

Confirmed directly (not assumed) after applying all three migrations:
- All three tables exist with the exact column set, types, and
  defaults specified in the migration SQL.
- All three have `rls_enabled: true`.
- All three FK constraints (`user_id` → `auth.users.id`) are present
  and correctly named.
- Primary keys match the migration SQL (`id` for 042/044,
  `user_id` for 043).

## Conclusion

All three migrations are safe, correctly indexed, fully RLS-covered,
reproducible against a clean database, and now free of the one real
performance issue live verification uncovered. They remain **not
applied to the production project** (`oshquaxsloolqucwvigc` main
branch) — only to the confirmed non-production `warehouse-validation`
branch, exactly as instructed. Applying them to production remains a
separate, explicit-approval decision (see `sprint15_go_no_go.md`).
