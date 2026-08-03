# V4A — SA/VIC official-metrics promotion package (loaded on the VALIDATION BRANCH)

**Production was NOT touched.** Migration `056` + the deterministic SA+VIC
candidate are now loaded on the designated Supabase **validation branch**
(`lzonauinzatmtytyoems`) only — see "Validation-branch load (executed)" below.
Production (`oshquaxsloolqucwvigc`), `main`, Vercel, env vars, Storage and Stash
were untouched, and there is no promotion beyond the validation branch.

## Validation-branch load (executed — Abdul-approved, validation branch only)
Loaded via `warehouse/scripts/promotion/load_validation_branch.mjs
--confirm-validation-load` (fail-closed prod-ref guard; SSL; statement_timeout).
- **Payload**: 689 rows — SA 491 + VIC 198; 606 direct + 83 derived (SA house
  yields). SHA-256 `cbd0b269d5ffc8b31501475c612172e0844bb3b69b400362d501f52b30392326`
  (pinned in `warehouse/reports/v4a/validation_load_manifest.json`; bytes gitignored).
- **`price_growth_12m` deliberately EXCLUDED**: it is a *signed* metric (can be < 0)
  and is incompatible with `056`'s `value > 0` invariant; deferred to a dedicated
  signed-metric lane (recorded in the manifest `excluded`).
- **All 16 load checks PASSED** (preflight / migration applied / core=mart=689 /
  4 post-load validations = 0 / least-privilege grants / idempotent reload /
  conflict fail-closed / transactional rollback) — `validation_load_report.json`.
- **Independent read-only re-verification PASSED** (9 checks) via
  `verify_validation_branch.mjs`: core=689, view=606 (direct-only), 83 derived
  yields in the internal mart, SA Belair + VIC bedroom-specific rent visible, no
  postcode/contextual row in the public view, Production ref never referenced.
- The public `v_official_suburb_metric_v1` view is **direct-only by design**;
  derived yields live in the internal `mart.official_suburb_metric` (status
  `derived`) pending a future exposed projection.

**STOP**: next remote action (Production promotion) requires separate approval.

---

## Rehearsal package (below reflects the pre-load local rehearsal)

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
