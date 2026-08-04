-- 058 — metric-aware value invariant: allow signed price_growth_12m.
--
-- STATUS: PREPARED, NOT APPLIED REMOTELY. Rehearsed locally only (blank +
-- Production-equivalent PostgreSQL via PGlite). Additive/forward-only: it replaces
-- migration 056's blanket `official_observation_value_positive` (value > 0) CHECK
-- with a metric-aware bound. Migration 056 is UNCHANGED (never edited). The 689
-- already-loaded official rows (all metrics currently > 0) remain valid under the
-- new constraint. Do not apply to the Supabase validation branch or Production
-- without separate human approval.
--
-- WHY: price_growth_12m is a SIGNED percentage — a 12-month change that can be
-- negative, zero or positive (real SA source minimum ≈ -6.11%). The 056 blanket
-- value>0 rule wrongly rejected it, so growth was excluded from the first payload.
-- This makes the invariant metric-aware: prices, rents, sales volume and yields
-- stay strictly positive; price_growth_12m is bounded but may be <= 0.
--
-- BOUNDS (evidence-based, one documented unit = percent):
--   floor  -100  — a positive median cannot fall by more than 100% in 12 months.
--   ceiling 1000  — generous headroom for legitimate small-sample quarterly swings
--                   (observed max ≈ 41.61%); catches gross data-entry errors.

alter table core.official_observation
  drop constraint official_observation_value_positive;

alter table core.official_observation
  add constraint official_observation_value_bounds check (
    case
      when metric = 'price_growth_12m' then value >= -100 and value <= 1000
      else value > 0
    end
  );

comment on constraint official_observation_value_bounds on core.official_observation is
  'Metric-aware value invariant. price_growth_12m is a signed percentage (may be <= 0), bounded to [-100, 1000] (floor: a positive median cannot fall >100% in 12 months; ceiling: generous small-sample headroom). All other metrics (prices, rents, sales volume, yields) must be strictly positive. Single documented growth unit: percent.';
