# Coverage V2 — validation-promotion package

**Production and Supabase (validation + Production) were NOT touched by this
sprint.** This package describes exactly how a future, human-approved sprint
would load the locally-materialised coverage into a Supabase **validation
branch** (never Production) after review. Nothing here has been executed
remotely.

## What was materialised locally (real, SQL-evidenced)

Phase 3A — NSW suburb gross-yield recovery from existing valid Propellect
observations, through an ephemeral local DuckDB warehouse
(`warehouse/data/local/coverage_v2.duckdb`, gitignored):

| Layer | Table | Rows |
|---|---|---|
| raw | `raw.yield_candidate` | 126 |
| staging | `staging.yield_candidate` (with disposition) | 126 |
| core | `core.market_observation` | 12 (2 inputs × 6) |
| mart | `mart.suburb_yield_recovered` | **6** |

Disposition ledger (reconciles to 126): `insufficient_sample` 78,
`incompatible_period` 42, `materialised` 6.

## Source manifest & checksum

- Source: `propellect_warehouse:v_suburb_market_snapshot_v1` (read-only REST).
- Raw file: `warehouse/data/local/nsw_yield_candidates.json` (gitignored).
- Manifest: `warehouse/data/local/nsw_yield_candidates.manifest.json` — records
  endpoint, `retrieved_at`, `row_count=126`, and the SHA-256 content digest of
  the canonical candidate set. Deterministic: two runs produced the identical
  digest, count (6) and mart rows.
- Transformation version: `gross_yield@1`. Parser/adapters: `qld_rta_rent@1`
  (not used for materialisation — deferred).

## Exact local reproduction commands

```
# 1. Reproduce the materialisation + SQL evidence (read-only pull → DuckDB)
node warehouse/scripts/coverage/materialise_nsw_yield.mjs --apply-local
# 2. Dry-run coverage measurement (no writes)
node warehouse/scripts/coverage/coverage_maximiser.mjs
# 3. Deterministic rerun check: rerun step 1, compare
#    warehouse/data/local/nsw_yield_candidates.manifest.json sha256 + mart count
```

## Migration order (prepared elsewhere / to prepare before promotion)

- `055_widen_get_market_snapshot_v2.sql` — already merged, **UNAPPLIED**.
- A new additive migration (next free number after inspecting the merged repo)
  would create `mart.suburb_yield_recovered` (or extend the snapshot mart) with
  the columns produced here: `geography_id, gross_yield_pct, property_type,
  geography_level, price_observation_id, rent_observation_id, sales_period,
  rent_period, formula_version, status`. **Not created/applied in this sprint**
  (guardrail: no remote migration application; materialisation stayed local).

## Expected validation queries (post-load, on a validation branch)

```sql
-- must equal 6
select count(*) from mart.suburb_yield_recovered;
-- every mart row references two real input observations
select count(*) from mart.suburb_yield_recovered y
  where not exists (select 1 from core.market_observation o where o.observation_id = y.price_observation_id)
     or not exists (select 1 from core.market_observation o where o.observation_id = y.rent_observation_id);  -- expect 0
-- no yield materialised from a stale/incompatible pair (all gaps ≤ 400d)
select count(*) from mart.suburb_yield_recovered where abs(date_diff('day', sales_period, rent_period)) > 400;  -- expect 0
```

## Rollback plan

Local-only: delete `warehouse/data/local/coverage_v2.duckdb` (regenerable).
Remote (future): the promotion migration would be additive; rollback = drop the
new mart object. No existing table is mutated.

## Remote preflight checklist (for the future approved sprint)

- [ ] Human approval recorded.
- [ ] Target = Supabase **validation branch** (never Production).
- [ ] `055` + new migration replay clean on a blank ephemeral DB (CI job).
- [ ] anon/authenticated grants reviewed — new mart exposed only via a
      read-only view, never a raw internal table; no service-role key client-side.
- [ ] Before/after coverage captured on the validation branch.
- [ ] Production snapshot `wh-snap-2026-07-31-ed76873c-min21` confirmed unchanged.

## Impact estimate

Storage: negligible (6 mart rows + 12 observation rows). Execution: seconds.
Security: read-only source pull; no credentials in artifacts; no client exposure.

## Evidence Production untouched

No Supabase write API, migration apply, or deploy was invoked this sprint. All
writes were to `warehouse/data/local/` (gitignored) and `warehouse/reports/`.
