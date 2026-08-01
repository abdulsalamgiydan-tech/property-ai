# Sprint 18 — Production Launch Execution Log

Date: 2026-08-01
Executed against: Production (`oshquaxsloolqucwvigc`, `app.propellect.com.au`)
Executed under: explicit user approval of the runbook in
`warehouse/reports/sprint18_3_final_release_proof.md` (frozen SHA
`454f01c34d77677856638e01d57251712db1157a`, PR #26).

This is the factual record of what was actually done against Production,
in execution order, cross-referencing the approved runbook's step numbers.
It supersedes nothing in the frozen report — that document is the approval
artifact; this one is the execution record.

## Pre-flight (runbook steps 1-4)

- Supabase org (`Macro`) confirmed on the **pro** plan (daily automated
  backups included). No MCP tool exposes the exact last-backup timestamp;
  not fabricated — a dashboard glance is the only way to see the literal
  number.
- Production migration ledger confirmed at exactly 10 migrations (up to
  `045`), zero `core`/`mart`/`staging`/`meta` schemas present — matching
  every rehearsal's baseline exactly.
- Current healthy Production deployment captured as rollback baseline:
  `dpl_AtHt2b5xLV7o6YDVsrVdS1LWA2Gf`, aliased to `app.propellect.com.au`.
- Vercel Production env vars confirmed to contain none of the 7 warehouse/
  research/API/Copilot/operations flags yet (clean starting state).
- Smoke baseline: `/` 200, `/dashboard` 200, `/research` 404 (correctly
  gated off pre-launch).

## Migrations (runbook steps 5-8)

Applied via `apply_migration` (Supabase Management API — no raw DB
password needed), each read fresh from disk immediately before applying,
in order: `048_warehouse_bootstrap_schemas` → `049_warehouse_bootstrap_geography`
→ `050_warehouse_bootstrap_meta` → `051_warehouse_bootstrap_marts` →
`052_warehouse_bootstrap_views_functions` → `053_warehouse_bootstrap_grants_prep`
→ `054_warehouse_internal_schema_rls_production` → existing
`046_research_api_grant_hardening` (applied unmodified, last).

All 8 applied cleanly, no errors, no manual repair. Post-migration
validation matched the contract exactly: 3 new schemas, 21 tables, 10
views, 8 functions, no `staging`, zero `anon`/`authenticated` schema
USAGE on `core`/`mart`/`meta`. Ledger recorded correctly and in the
intended apply order (`list_migrations` confirmed).

## Data import (runbook steps 9-10)

Required the real Production database password, which per this sprint's
credential-handling rules could not be self-provisioned or handled by the
agent directly. Built a dedicated, Production-specific secure runner
(`warehouse/scripts/rehearsal/Invoke-ProductionImport.ps1`, committed at
`e97a588`) — same `Read-Host -AsSecureString` → process-scoped
`PGPASSWORD` → `finally`-block-cleared pattern as the rehearsal runner,
plus an additional typed `"IMPORT TO PRODUCTION"` confirmation gate and
the explicit double opt-in (`--i-acknowledge-production-target` +
`SNAPSHOT_ALLOW_PRODUCTION_TARGET=true`) that `lib.mjs#resolveTarget`
requires to allow a Production target at all.

Abdul ran this himself; reported **"PRODUCTION import + verify PASSED."**
Independently re-verified (not just trusted) via direct read-only row
counts against Production for all 21 tables: **exact match to the frozen
manifest, 452,176 rows total.**

## Query and security validation (runbook steps 11-13)

- `search_market_geographies_v2('Parramatta', ...)` → 4 real rows
  (including the genuinely different QLD "Parramatta Park").
- `get_market_snapshot_v2` → real Parramatta NSW data (confidence: high,
  coverage: full).
- `compare_market_geographies_v1` → correctly shows QLD Parramatta Park
  as `confidence_label: insufficient` with null metrics — missing data
  shown honestly, not fabricated.
- `get_market_timeseries_v2` → 137 real rows, 2017-03 through 2026-07.
- `get_market_map_markers_v1` (valid bbox) → 402 real markers. Invalid
  bbox correctly raises `bounding box outside Australia's valid range`.
- `get_advisors(security)` → identical finding set to every prior
  rehearsal this sprint (RLS-no-policy INFO ×21, SECURITY DEFINER view
  ERROR ×10, function search_path WARN ×1, anon/authenticated SECURITY
  DEFINER WARN ×16, pre-existing `waitlist`/leaked-password findings).
  **No new critical/high findings.**
- Write/internal-schema denial confirmed directly:
  `has_table_privilege('anon', 'core.dim_geography', 'INSERT')` = false,
  `has_table_privilege('anon', ..., 'SELECT')` = false (no direct table
  read either — only the curated views/functions are granted),
  `has_table_privilege('authenticated', 'mart.suburb_market_snapshot',
  'UPDATE')` = false, `has_schema_privilege` false for anon/authenticated
  on all of `core`/`mart`/`meta`.

## Flags, redeploy, live UAT (runbook steps 14-16)

**Finding during flag activation, resolved before proceeding**: the
approved runbook named 3 flags (`WAREHOUSE_PREVIEW_ENABLED`,
`PUBLIC_API_V1_ENABLED`, `MULTI_STATE_RESEARCH_ENABLED`), but code
inspection (`lib/warehouse/client.ts` / `env.ts`) showed the warehouse
client also hard-requires `WAREHOUSE_SUPABASE_URL` and
`WAREHOUSE_SUPABASE_ANON_KEY` — without them `isWarehouseConfigured()`
returns false and the client is `null`, so the flags alone would not have
made the feature actually work. Neither existed in Production's Vercel
env. This was outside the literal runbook text, so it was surfaced to
Abdul directly rather than silently added; approved, then set to
Production's own project URL and anon key (not secrets — anon keys are
designed to be public, access is gated by RLS/grants, not secrecy).

All 5 Production env vars set: `WAREHOUSE_SUPABASE_URL`,
`WAREHOUSE_SUPABASE_ANON_KEY`, `WAREHOUSE_PREVIEW_ENABLED=true`,
`PUBLIC_API_V1_ENABLED=true`, `MULTI_STATE_RESEARCH_ENABLED=true`.
Confirmed `RESEARCH_COPILOT_ENABLED`/`INTERNAL_OPERATIONS_ENABLED` remain
absent. Redeployed the existing Production build (`dpl_AtHt2b5xLV7o6YDVsrVdS1LWA2Gf`
→ new deployment `dpl_FfcAqKDQsEthMuqx1J1ZAFHojhH2`, same source, only the
env change), aliased to `app.propellect.com.au`.

**Live smoke pass results**:
- `/`, `/dashboard` 200 (unchanged).
- `/research`, `/research/explore`, `/research/compare`, `/research/map`,
  `/research/suburb/13167`, `/research/postcode/2150` — all 200, real
  data confirmed for the suburb page.
- `/research/copilot/13167`, `/admin` — both still 404, correctly gated
  off.
- `/api/v1/search`, `/api/v1/snapshot/<id>`, `/api/v1/compare` (valid) —
  200 with real data. `/api/v1/compare` with only 1 id — 400 with a clear
  error message (correct validation). Arbitrary RPC probe
  `/api/v1/rpc/exec_sql` — 404.

**One transient anomaly found and characterized, not glossed over**: a
direct RPC call to `get_market_map_markers_v1` with no `type` filter and
a ~30km-wide bounding box hit a Postgres statement timeout (`57014`) on
its first invocation immediately after the migration/import/redeploy
burst. Three immediate retries of the identical call all succeeded in
0.48-0.88s — this was a one-time cold-start blip (connection pool /
query-plan cache warm-up), not a deterministic bug. Additionally
confirmed this exact code path is **unreachable through the shipped
`/research/map` UI**, which only offers three filter buttons (Suburbs/
Postcodes/LGAs, default Suburbs) and never omits the type filter — so no
real user of the product can trigger this. The `/api/v1/map-markers`
route (the only path that could reach it, if an external caller omits
the optional `type` param) also degrades gracefully rather than erroring:
`lib/warehouse/queries.ts#getMapMarkers` swallows RPC errors to an empty
array, so even a worst-case recurrence would surface as an empty (not
wrong, not crashing) API response. Not a launch blocker; noted as a
candidate for a future forward-fix (index or required `type` param on the
public API) — no schema or code change made for this during launch, since
that would be scope beyond the approved runbook.

## t+0 monitoring (runbook step 17, immediate portion)

Re-ran the full smoke pass and pulled Vercel runtime logs for the new
deployment: **zero 5xx responses** across all logged requests (the one
`400` is the intentional malformed-input test on `/api/v1/compare` —
correct, expected behavior, not an error). All routes/APIs healthy.

**5/15/30/60-minute monitoring windows**: per Abdul's explicit choice,
these will be checked live when he messages back at each interval, rather
than simulated or skipped. This report will be updated with those results
as they come in.

## Outstanding before final closeout (runbook steps 18-20)

- Confirm Copilot/Admin/operations remain disabled through the full
  monitoring period (t+0 already confirmed; recheck at each window).
- Once all monitoring windows are clean, record launch complete
  (timestamp, final flag state, final schema/row-count reconfirmation).
- No further Production migration, data import, flag change, or deploy
  has occurred or will occur beyond what's recorded above without a
  separate, explicit go-ahead.
