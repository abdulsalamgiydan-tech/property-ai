-- Sprint 18.2 -- Production warehouse bootstrap, Phase 8, step 7 of 8.
--
-- Defense-in-depth: enable RLS (no policies) on exactly the 21 core/mart/
-- meta tables this bootstrap actually creates on Production. Structural
-- template taken from migration 047_warehouse_internal_schema_rls.sql
-- (already applied to warehouse-validation), but authored as new content
-- rather than reused verbatim: 047 enables RLS on 53 tables, and Production
-- will only ever have this bootstrap's 21-table minimum contract, so
-- applying 047 unmodified would hard-fail the moment it reached any of the
-- 32 tables Production doesn't have. This is a technical requirement, not
-- a style choice.
--
-- Not currently exploitable even without this migration: migration 053
-- already revokes schema USAGE on core/mart/meta from anon/authenticated,
-- so PostgREST can never reach these tables regardless of RLS state.
-- service_role bypasses RLS entirely (standard Supabase BYPASSRLS role
-- attribute), so the snapshot :import tool and any ETL loader are
-- unaffected. This migration only matters if a future migration ever
-- accidentally grants schema USAGE without also restoring RLS -- it closes
-- that specific future failure mode now, while it's cheap and low-risk.
--
-- No policies are added deliberately, matching 047's rationale: these are
-- ETL-loaded, curated reference tables the app never has authenticated
-- users write to directly; the only intended read surface is the narrow,
-- already-hardened set of views/functions from migrations 052/053, applied
-- immediately after this file alongside existing 046, not these tables
-- themselves.

alter table core.dim_geography enable row level security;

alter table mart.suburb_market_snapshot enable row level security;
alter table mart.postcode_market_snapshot enable row level security;
alter table mart.suburb_demographic_profile_2021 enable row level security;
alter table mart.postcode_demographic_profile_2021 enable row level security;
alter table mart.suburb_market_timeseries enable row level security;
alter table mart.postcode_market_timeseries enable row level security;
alter table mart.suburb_rent_quarterly enable row level security;
alter table mart.postcode_rent_quarterly enable row level security;
alter table mart.lga_rent_quarterly enable row level security;

alter table meta.dataset enable row level security;
alter table meta.source enable row level security;
alter table meta.dataset_freshness_status enable row level security;
alter table meta.dataset_refresh_run enable row level security;
alter table meta.metric_lineage_registry enable row level security;
alter table meta.metric_assumption enable row level security;
alter table meta.jurisdiction enable row level security;
alter table meta.data_incident enable row level security;
alter table meta.data_quality_rule enable row level security;
alter table meta.data_quality_run enable row level security;
alter table meta.data_quarantine_summary enable row level security;
