# Sprint 18.2 — Production Schema Fingerprint & Migration 046 Ordering Resolution

Date: 2026-07-31
Branch: `feature/sprint18-production-warehouse-bootstrap`

## Phase 2 — Actual Production schema fingerprint (at migration 045)

Captured via direct catalog inspection (`pg_namespace`, `pg_extension`,
`information_schema.tables`), not migration-ledger names.

**Production (`oshquaxsloolqucwvigc`) schemas:** `auth`, `extensions`,
`graphql`, `graphql_public`, `pgbouncer`, `public`, `realtime`, `storage`,
`supabase_migrations`, `vault` — all standard Supabase-managed schemas plus
`public`. **No `core`, `mart`, `staging`, or `meta` schema exists.** Confirms
and re-verifies the Sprint 18 reconciliation finding independently.

**Production extensions installed:** `pg_stat_statements`, `pgcrypto`,
`plpgsql`, `supabase_vault`, `uuid-ossp`. **`postgis` is NOT installed**
(available as a default extension, `installed_version: null`).

**Production `public` schema:** 14 base tables, all app/user-owned
(`property_reports`, `strategy_reports`, `watchlist_items`,
`user_entitlements`, `user_feedback`, `user_onboarding_preferences`, etc.) —
zero warehouse objects.

**Production migration ledger:** `remote_schema` + `037`–`045`. Confirms
`046` was never applied (consistent with the schema gap — nothing to grant
on).

## Critical finding: PostGIS is not required for the minimum launch contract

Checked every one of migration 046's 10 granted views and 8 granted RPC
functions on warehouse-validation for PostGIS dependency, using a precise
regex (`st_[a-z]+\(` for function calls, `\mgeom\M|\mgeometry\M` for column
references) after an initial naive substring check produced false positives
(the substring `st_` appears incidentally in ordinary identifiers).

**Result: zero of the 18 required objects reference PostGIS in any form.**
`get_market_map_markers_v1` — the one function that sounds most likely to
need spatial functions — filters on plain `numeric` `centroid_lat`/
`centroid_lon` columns on `core.dim_geography` via ordinary `between`
comparisons, not PostGIS operators. The only PostGIS-typed columns in the
whole warehouse are `core.dim_geography.geom` and `staging.asgs_geography.geom`
(both `geometry`), used only inside the ETL pipeline to derive
`centroid_lat`/`centroid_lon` at build time — never read by the runtime
query/API surface.

**Consequence:** the Production bridge does not need to install the
`postgis` extension, and `core.dim_geography` does not need a `geom` column
in the minimum launchable contract. This removes an entire extension
dependency and a large geometry column from the smallest-honest-warehouse
scope (Phase 4), consistent with the brief's instruction to exclude
"temporary ingestion artefacts not needed at runtime."

## Phase 3 — Migration 046 ordering: resolved

**The problem:** migration 046 (`REVOKE`/`GRANT` on 10 views + 8 functions)
would fail immediately if applied to Production as-is — the views/functions
it references don't exist, since the migrations that create them (`014`,
`016`, `023`, and others in the `003`–`036` range) were never applied to
Production.

**Selected strategy: Option D — controlled schema-bootstrap sequence.**
New forward-only migrations create every object `046` depends on; `046`
itself is applied last, completely unmodified.

**Why this is supported, not a workaround:** Supabase's migration ordering
is determined by the *version timestamp recorded at apply time*, not by the
repository's short numeric filename prefix (`045_...`, `046_...`). Direct
proof from this session: migration `047_warehouse_internal_schema_rls.sql`
was applied to warehouse-validation on 2026-07-30 and recorded version
`20260730222652`; migration `046_research_api_grant_hardening.sql` was
applied earlier and recorded version `20260725111730` — an *earlier*
timestamp than 047's, despite 047 being the "later" filename number. This
confirms application order is whatever order you actually call
apply-migration in, independent of filename numbering. There is no need to:
- fabricate an artificial timestamp to slot a migration "between" 045 and
  046 (Option A) — apply-time ordering already achieves this without any
  trick;
- make 046 conditional/idempotent (Option C) — it only needs to run once,
  after its prerequisites exist, and it is naturally safe to run exactly
  once since it contains no `CREATE`/`DROP`;
- rewrite or reorder warehouse-validation's already-applied history — that
  ledger is untouched by anything Production-side.

**Resulting Production ledger sequence (conceptual — exact new migration
numbers to be finalized in Phase 8):**
1. `037`–`045` (already applied, unchanged)
2. New migration(s), repo-numbered `048+`: create `core`/`mart`/`meta`
   schemas and the minimum-contract tables/columns/constraints/indexes (no
   `staging` schema, no `postgis` extension — both confirmed unnecessary
   above)
3. New migration(s): create the 10 views + 8 functions, verified
   PostGIS-free, exactly as they exist on warehouse-validation
4. Existing `046_research_api_grant_hardening.sql`, **applied unmodified** —
   now succeeds because every referenced object exists
5. New migration: RLS defense-in-depth on the new Production tables,
   equivalent in intent to `047` (which already exists for
   warehouse-validation)

This means migration `046` will carry a *later* real apply-timestamp on
Production than the new `048+` bootstrap migrations, even though its
filename number is smaller. This is a cosmetic ordering quirk specific to
Production's unique starting state (missing `003`–`036`), not a functional
problem — Supabase orders execution strictly by recorded version, not by
filename. It does not affect `clean-migration-replay`'s fresh/disposable CI
rehearsal, where files still apply in their existing lexical order against a
blank database and 046's prerequisites already exist by the time it's
reached (via `003`–`036`). The Production-specific application order is
strictly a Production deployment-runbook detail and will be spelled out
explicitly in the Phase 13 runbook, not left implicit.

**Rollback/forward-fix:** migration 046 is grant-only (no structural
changes), so if the bootstrap step fails partway, 046 is simply never
reached — Research/API Production flags stay disabled regardless of schema
state, so no partial warehouse is ever user-visible even if this sequence
is interrupted.

## Next
Phase 4 (minimum launchable warehouse contract, now confirmed PostGIS-free)
and Phase 8 (writing the actual new forward migrations) are next.
