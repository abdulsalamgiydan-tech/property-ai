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

## PostgreSQL-valid validation SQL (for the future, real, qualified payload)

These are written for **PostgreSQL/Supabase** (not DuckDB). They assume the
future promotion mart `mart.suburb_yield_recovered` and observation table
`core.market_observation`:

```sql
-- 1. every mart row cites two REAL upstream observations
select count(*) from mart.suburb_yield_recovered y
where not exists (select 1 from core.market_observation o where o.observation_id = y.price_observation_id)
   or not exists (select 1 from core.market_observation o where o.observation_id = y.rent_observation_id);  -- expect 0

-- 2. no aggregate 'all' yields (registry: house/unit only)
select count(*) from mart.suburb_yield_recovered where property_type not in ('house','unit');  -- expect 0

-- 3. period compatibility (PostgreSQL date arithmetic, not DuckDB date_diff)
select count(*) from mart.suburb_yield_recovered
where abs(price_period - rent_period) > interval '400 days';  -- expect 0

-- 4. both inputs independently suburb-level & direct
select count(*) from mart.suburb_yield_recovered y
join core.market_observation p on p.observation_id = y.price_observation_id
join core.market_observation r on r.observation_id = y.rent_observation_id
where p.geography_level <> 'suburb' or r.geography_level <> 'suburb'
   or p.status <> 'direct' or r.status <> 'direct';  -- expect 0
```

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
