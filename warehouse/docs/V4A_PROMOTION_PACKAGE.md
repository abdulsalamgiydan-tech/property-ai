# V4A — SA/VIC official-metrics promotion package (rehearsed, NOT applied)

**Production and Supabase (validation + Production) were NOT touched.** No remote
migration was applied. This package is rehearsed locally only and awaits separate
human approval before any validation-branch load.

## Migration
`supabase/migrations/056_official_suburb_metrics.sql` — **additive, unapplied**.
Creates `core.official_observation` (full lineage, internal), `mart.official_suburb_metric`
(internal), and the read-only public view `v_official_suburb_metric_v1`. Least-
privilege: `anon`/`authenticated` get **SELECT on the view only**, never on
core/mart/raw/staging; no existing object altered; no grant widened; migration
`055` unchanged. Value>0 / status / property-type CHECK constraints. No
property-level PII (aggregate medians/counts only).

## Loader + validation
`warehouse/scripts/promotion/officialPromotion.mjs`: idempotent `INSERT_OBSERVATION`
(`on conflict (observation_id) do nothing` → existing id with different content
is **never overwritten**), `INSERT_MART` (only `direct`/`derived` reach the mart;
`contextual`/quarantine excluded), and `POSTLOAD_VALIDATIONS` (mart-view direct-
only, no non-positive, no contextual in mart, derived-yield inputs exist).

## Rehearsal (real PostgreSQL via PGlite) — ALL PASS
`promotion_rehearsal.test.ts` proves, against real Postgres:
1. blank-DB migration apply (tables + view + least-privilege grant — anon has
   SELECT on the view, NOT on `core.official_observation`);
2. current-schema additive apply (pre-existing objects untouched);
3. load + all post-load validations = 0 violations;
4. idempotent second load (no change);
5. shuffled-order load → identical final state;
6. mid-load failure → transactional rollback (no partial state);
7. existing-id/different-content → fail closed (original kept);
8. SA house yields requalify through the full JS `qualifyYield` contract;
9. contextual postcode-2527 rent never reaches the direct suburb view (the
   Calderwood rule: no suburb yield from postcode rent).

## Candidate row counts (deterministic; from the local ingest reports)
- SA: 487 core observations / 177 suburbs (92 house price, 153 house rent, 71
  unit rent, 79 12-mo growth, 92 volume) + **83 qualified house yields**.
- VIC: 198 direct bedroom-specific suburb rents / 35 suburbs.
- Payloads are content-addressed under gitignored `warehouse/data/local`; only
  checksums/counts + this package are committed. Regenerate via
  `build_sa_warehouse.mjs --apply-local --as-of <d>` and
  `build_vic_warehouse.mjs --apply-local --as-of <d>` (deterministic).

## Rollback
Additive only → rollback = `drop view public.v_official_suburb_metric_v1;
drop table mart.official_suburb_metric; drop table core.official_observation;`
No existing table is mutated.

## Abort conditions (block the load)
Schema fingerprint change, licence/attribution change, geography-match decline,
row-count collapse/explosion, quarantine increase, coverage regression, any
`contextual`/PII row in an accepted layer, immutable-id conflict with different
content, ASGS-version mix. The refresh state machine surfaces these as
`blocked_*` states.

## Exact next human approval (NOT executed here)
Remote validation-branch load requires Abdul's explicit approval. The exact steps
would be: (1) apply `056` to a Supabase **validation branch** (never Production);
(2) load the deterministic payload via the idempotent loader; (3) run the
post-load validations = 0; (4) confirm the Production snapshot
`wh-snap-2026-07-31-ed76873c-min21` unchanged. No command in this repo performs
that remotely.
