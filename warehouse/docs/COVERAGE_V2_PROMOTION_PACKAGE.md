# Coverage V2.1 — promotion package (yield lane)

**Production and Supabase (validation + Production) were NOT touched.** No remote
migration was applied. Nothing here has been executed remotely.

## Outcome of the yield lineage audit: ZERO promotion-ready yields

The NSW suburb gross-yield lineage audit
(`warehouse/scripts/coverage/materialise_nsw_yield.mjs`) requalified all **126**
naive price+rent overlap candidates against the full warehouse contract
(`lib/warehouse/yieldLineage.ts`). Result: **0 promotion-ready** (all
`lineage_unverified`). Reasons, from the read-only warehouse contract:

- the medians are aggregate **`all`** dwelling type — the metric registry
  permits `gross_yield` for `house`/`unit` only, never `all`;
- **no upstream observation ids** are exposed → derivation cannot cite its two
  real inputs;
- **no actual sample sizes** are exposed (only confidence labels) → the metric
  minimum cannot be proven;
- **no bedroom groups** are exposed → compatibility cannot be proven.

Per the sprint rule "if the defensible result falls from six to zero, report
zero", **no yield promotion migration is created** — an empty/misleading yield
migration would be worse than none.

## Consequence for migrations

- `055_widen_get_market_snapshot_v2.sql` — remains merged and **UNAPPLIED**,
  unchanged.
- **No new migration** is proposed by this package (0 qualified rows). When
  real, lineage-complete observations exist (see the provenance evidence request
  and the deferred official sources), the next additive migration would take the
  next free number after inspecting the merged repo, and would create a
  read-only `mart`/view carrying: `geography_id, gross_yield_pct, property_type
  (house|unit), bedroom_group, price_observation_id, rent_observation_id,
  price_period, rent_period, formula_version, status` — exposed only via a
  granted view, never a raw internal table.

## PostgreSQL-valid validation SQL (executed, not asserted)

The statements live in one module,
`warehouse/scripts/coverage/promotionValidationSql.mjs`, and are **executed
against real PostgreSQL (PGlite/WASM)** by
`warehouse/scripts/coverage/promotion_sql.test.ts` — so they are proven valid,
not merely written. They validate the future promotion mart
`mart.suburb_yield_recovered` + `core.market_observation` (schema in the same
module).

Correction applied: in PostgreSQL `date - date` returns an **integer number of
days**, so the period check compares to an integer (`> 400`), not
`interval '400 days'` (which the prior doc used, and which errors on `date`
columns):

```sql
-- period compatibility (date - date is integer days in PostgreSQL)
select count(*)::int as violations
from mart.suburb_yield_recovered
where abs(price_period - rent_period) > 400;  -- expect 0
```

The other checks (orphan observation refs, aggregate `'all'` property type, and
non-direct/non-suburb inputs) are in the module and each returns
`violations = 0` for a qualified payload; the test also proves a deliberate
`'all'` row is caught (`violations = 1`).

## Migration replay (local, ephemeral, blank Postgres)

`055` and any future migration must replay cleanly on a **blank ephemeral local
Postgres** — the existing `clean-migration-replay` CI job (postgis service
container, workflow_dispatch) does exactly this. No remote apply.

## Rollback

No remote change was made, so there is nothing to roll back. A future additive
promotion migration would roll back by dropping only the new mart object; no
existing table is mutated.

## Proof Production untouched

No Supabase write API, migration apply, or deploy was invoked. All writes were
to `warehouse/data/local/` (gitignored) and `warehouse/reports/`. Production
snapshot `wh-snap-2026-07-31-ed76873c-min21` unchanged.
