-- ============================================================
-- Propellect — RBA Interest Rate National Context Layer (Sprint 8)
--
-- Official RBA interest-rate data as a national macro context
-- layer for the residential property warehouse: cash rate target
-- history, plus owner-occupier/investor housing lending rates
-- (variable and fixed) from two official RBA statistical tables.
--
-- This is a compact module by design (~2,300 rows total across
-- both tables) — no full raw file is loaded to the branch, only
-- the curated fact + mart rows described in
-- warehouse/reports/rba_rates_source_manifest.md.
--
-- Idempotent and non-destructive: `if not exists` throughout, no
-- DROP / TRUNCATE / DELETE, no data loads in this migration, no
-- secrets. Requires migrations 003-005 (meta/core schemas,
-- core.dim_geography not referenced here — this data is national,
-- not tied to a geography row). Branch database only until
-- approved for production.
--
-- NULL-distinctness note (lesson carried over from Sprint 7's
-- core.fact_rental_market_summary bug): borrower_type and
-- loan_type are nullable (cash rate target has neither), and a
-- plain `unique` constraint on columns including a nullable
-- column does NOT prevent duplicate rows sharing NULL (SQL
-- NULL <> NULL). Both tables below use an expression-based unique
-- index with coalesce(..., sentinel) from the outset instead of a
-- plain UNIQUE constraint, so ON CONFLICT DO NOTHING will actually
-- dedupe correctly on first use.
-- ============================================================

-- ── 1. core.fact_interest_rates ──────────────────────────────
-- Grain: one row per reference_period x rate_type x borrower_type
-- x loan_type. National measure — no geography_id (not suburb/
-- postcode/LGA-scoped).
create table if not exists core.fact_interest_rates (
  interest_rate_id     uuid primary key default gen_random_uuid(),
  reference_period      date not null,             -- decision effective-date (cash rate) or first-of-month (lending-rate series)
  period_type            text not null,             -- 'day' (A2 change-events) | 'month' (F5/F6 monthly series)
  rate_type               text not null,            -- 'cash_rate_target' | 'housing_lending_rate' | 'indicator_lending_rate'
  borrower_type             text,                   -- 'owner_occupier' | 'investor' | NULL (cash rate target has no borrower type)
  loan_type                  text,                  -- 'all' | 'variable' | 'fixed_le_3y' | 'fixed_gt_3y' | 'standard_variable' | 'fixed_3y' | NULL
  rate_percent                 numeric,              -- NULL when the official source value is not a single clean number (see data_quality_status), never invented/estimated
  series_id                     text,                -- official RBA series code (e.g. FLRHOOVA) for traceability back to the source table
  source_id                      text references meta.source(source_id),
  dataset_id                      text references meta.dataset(dataset_id),
  load_run_id                      uuid references meta.load_run(load_run_id),
  source_file_id                    uuid references meta.source_file(source_file_id),
  data_quality_status                 text,          -- 'passed' | 'range_not_numeric' (see manifest — 3 pre-Aug-1990 A2 rows)
  confidence_label                     text not null, -- 'official' (single published number) | 'range_not_numeric' — every row is labelled, never a bare rate
  created_at                            timestamptz not null default now()
);
comment on table core.fact_interest_rates is
  'Official RBA interest-rate facts: cash rate target (RBA Table A2, decision-effective dates) and housing lending rates (RBA Tables F5/F6, monthly, owner-occupier/investor x variable/fixed). National measure, not geography-scoped. Grain: one row per reference_period x rate_type x borrower_type x loan_type. Missing/non-numeric source values stay NULL, never zero-filled or estimated. This is descriptive macro context only — not a recommendation, score, AVM or forecast.';
create index if not exists fact_interest_rates_period_idx
  on core.fact_interest_rates (reference_period desc);
create index if not exists fact_interest_rates_type_idx
  on core.fact_interest_rates (rate_type, borrower_type, loan_type, reference_period desc);
create unique index if not exists fact_interest_rates_natural_key
  on core.fact_interest_rates (reference_period, rate_type, (coalesce(borrower_type, '')), (coalesce(loan_type, '')));

-- ── 2. mart.national_interest_rate_context ───────────────────
-- Grain: same as core fact above, with human-readable labels for
-- downstream consumers (future affordability calculations) —
-- built directly from core.fact_interest_rates, no geography join
-- needed since this is inherently a national series.
create table if not exists mart.national_interest_rate_context (
  mart_row_id             uuid primary key default gen_random_uuid(),
  reference_period         date not null,
  period_type               text not null,
  rate_type                   text not null,
  rate_type_label               text,               -- human-readable, e.g. 'Cash Rate Target'
  borrower_type                  text,
  loan_type                       text,
  rate_percent                      numeric,
  data_quality_status                 text,
  confidence_label                     text not null,
  source_summary                        jsonb,       -- series_id, official table code (A2/F5/F6), publisher
  created_at                             timestamptz not null default now(),
  updated_at                              timestamptz not null default now()
);
comment on table mart.national_interest_rate_context is
  'Curated national interest-rate context mart, rebuilt from core.fact_interest_rates with human-readable labels. Grain: one row per reference_period x rate_type x borrower_type x loan_type. Intended for future affordability calculations and as macro context alongside NSW sales/rent/yield marts — not a recommendation, score, AVM or forecast.';
create index if not exists mart_national_interest_rate_period_idx
  on mart.national_interest_rate_context (reference_period desc);
create unique index if not exists mart_national_interest_rate_natural_key
  on mart.national_interest_rate_context (reference_period, rate_type, (coalesce(borrower_type, '')), (coalesce(loan_type, '')));
