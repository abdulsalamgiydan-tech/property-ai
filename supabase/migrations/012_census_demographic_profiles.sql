-- ============================================================
-- Propellect — Census Demographic Profile Marts (Sprint 9, Phase 4)
--
-- Compact, curated ABS 2021 Census demographic/income/housing-tenure
-- profile: one wide row per SAL/POA geography (not a tall fact table),
-- built from official ABS GCP DataPack tables G01/G02/G35 (population,
-- medians/income, household composition) plus the already-branch-resident
-- Sprint 3 dwelling-stock/tenure marts (dwelling type + tenure percentages).
--
-- Idempotent and non-destructive: `if not exists` throughout, no
-- DROP / TRUNCATE / DELETE, no data loads in this migration, no secrets.
-- Branch database only until approved for production.
-- ============================================================

-- ── 1. mart.suburb_demographic_profile_2021 ──────────────────
-- Grain: one row per SAL (suburb) x census_year. Wide, not tall — every
-- demographic measure is a column, not a separate row.
create table if not exists mart.suburb_demographic_profile_2021 (
  profile_id                     uuid primary key default gen_random_uuid(),
  geography_id                    text references core.dim_geography(geography_id),
  geography_code                   text not null,
  geography_name                    text,
  geography_type                     text not null default 'SAL',
  state_code                          text,
  census_year                          integer not null default 2021,
  total_population                      integer,           -- G01 Tot_P_P
  population_2016                        integer,          -- intentionally NULL this sprint — 2016/2021 ASGS boundary mismatch, see census_demographics_source_manifest.json
  population_2021                         integer,         -- = total_population, kept as an explicit named column per spec
  population_growth_2016_2021_pct          numeric,        -- intentionally NULL this sprint (depends on population_2016)
  median_age                                numeric,        -- G02 Median_age_persons
  total_households                           integer,       -- G35 Total_Total
  family_households                           integer,      -- G35 Total_FamHhold
  lone_person_households                       integer,     -- G35 Num_Psns_UR_1_Total
  average_household_size                        numeric,    -- G02 Average_household_size
  median_weekly_household_income                 integer,   -- G02 Median_tot_hhd_inc_weekly
  median_weekly_personal_income                   integer,  -- G02 Median_tot_prsnl_inc_weekly
  median_weekly_family_income                      integer, -- G02 Median_tot_fam_inc_weekly
  census_median_weekly_rent                         integer, -- G02 Median_rent_weekly — census self-reported; distinct from mart.*_rent_quarterly (DCJ administrative series), never blended
  census_median_monthly_mortgage                     integer, -- G02 Median_mortgage_repay_monthly — census self-reported; distinct from the Phase 5 RBA-rate-based repayment estimate, never blended
  renter_household_pct                                numeric, -- from core.fact_household_tenure (Sprint 3)
  owner_with_mortgage_pct                              numeric,
  owner_outright_pct                                    numeric,
  occupied_dwelling_count                                integer, -- from core.fact_dwelling_stock (Sprint 3)
  unoccupied_dwelling_count                               integer,
  detached_house_pct                                       numeric,
  apartment_unit_pct                                        numeric,
  geography_method                                           text not null default 'direct', -- 'direct' (native SAL/POA GCP table) throughout this dataset
  confidence_label                                            text not null,
  data_quality_status                                          text not null default 'passed',
  missing_metric_reasons                                        jsonb, -- e.g. {"population_2016": "2016/2021 ASGS boundary mismatch — see source manifest"}
  source_summary                                                 jsonb,
  created_at                                                      timestamptz not null default now(),
  updated_at                                                       timestamptz not null default now()
);
comment on table mart.suburb_demographic_profile_2021 is
  'Curated 2021 Census demographic/income/tenure profile, one wide row per SAL. Built from official ABS GCP DataPack tables G01/G02/G35 (direct, no correspondence weighting — SAL is a native GCP geography) plus the Sprint 3 dwelling-stock/tenure marts. Missing values (e.g. population_2016) stay NULL with a reason in missing_metric_reasons — never zero-filled or estimated across mismatched geography boundaries. Descriptive context only — not a recommendation, score, AVM or forecast.';
create index if not exists suburb_demographic_profile_geo_idx
  on mart.suburb_demographic_profile_2021 (geography_id);
create index if not exists suburb_demographic_profile_state_idx
  on mart.suburb_demographic_profile_2021 (state_code);
create unique index if not exists suburb_demographic_profile_natural_key
  on mart.suburb_demographic_profile_2021 (geography_id, census_year);

-- ── 2. mart.postcode_demographic_profile_2021 ────────────────
-- Grain: one row per POA (postcode) x census_year.
create table if not exists mart.postcode_demographic_profile_2021 (
  profile_id                     uuid primary key default gen_random_uuid(),
  geography_id                    text references core.dim_geography(geography_id),
  geography_code                   text not null,
  geography_name                    text,
  geography_type                     text not null default 'POA',
  state_code                          text,
  census_year                          integer not null default 2021,
  total_population                      integer,
  population_2016                        integer,
  population_2021                         integer,
  population_growth_2016_2021_pct          numeric,
  median_age                                numeric,
  total_households                           integer,
  family_households                           integer,
  lone_person_households                       integer,
  average_household_size                        numeric,
  median_weekly_household_income                 integer,
  median_weekly_personal_income                   integer,
  median_weekly_family_income                      integer,
  census_median_weekly_rent                         integer,
  census_median_monthly_mortgage                     integer,
  renter_household_pct                                numeric,
  owner_with_mortgage_pct                              numeric,
  owner_outright_pct                                    numeric,
  occupied_dwelling_count                                integer,
  unoccupied_dwelling_count                               integer,
  detached_house_pct                                       numeric,
  apartment_unit_pct                                        numeric,
  geography_method                                           text not null default 'direct',
  confidence_label                                            text not null,
  data_quality_status                                          text not null default 'passed',
  missing_metric_reasons                                        jsonb,
  source_summary                                                 jsonb,
  created_at                                                      timestamptz not null default now(),
  updated_at                                                       timestamptz not null default now()
);
comment on table mart.postcode_demographic_profile_2021 is
  'Curated 2021 Census demographic/income/tenure profile, one wide row per POA. Same construction and NULL-handling as mart.suburb_demographic_profile_2021.';
create index if not exists postcode_demographic_profile_geo_idx
  on mart.postcode_demographic_profile_2021 (geography_id);
create index if not exists postcode_demographic_profile_state_idx
  on mart.postcode_demographic_profile_2021 (state_code);
create unique index if not exists postcode_demographic_profile_natural_key
  on mart.postcode_demographic_profile_2021 (geography_id, census_year);
