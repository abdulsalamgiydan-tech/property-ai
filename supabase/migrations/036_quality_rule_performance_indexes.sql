-- Sprint 12, Workstream 15 — performance hardening.
--
-- WS9's future_dated_observation rule (rule_engine.mjs) runs
-- `where reference_period > current_date` against core.fact_residential_sales_summary
-- on every quality check. Measured live: 477ms, because the only
-- available index (fact_sales_period_type_idx) has reference_period as
-- its SECOND column, not the leading one -- Postgres can still use it as
-- an index scan, but inefficiently. 270,701 rows / 219 MB table; this
-- rule runs on every warehouse:quality:check invocation, including (once
-- wired up) every refresh_engine_v3.mjs --branch-load promotion gate.
-- A dedicated leading-column index directly serves this exact predicate.

create index fact_sales_reference_period_idx
  on core.fact_residential_sales_summary (reference_period);

create index fact_rental_reference_period_idx
  on core.fact_rental_market_summary (reference_period);
