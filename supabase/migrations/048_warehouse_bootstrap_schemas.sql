-- Sprint 18.2 -- Production warehouse bootstrap, Phase 8, step 1 of 8.
--
-- Creates the three schemas the minimum launchable Research Hub + API v1
-- contract needs. Production is currently at migration 045 with NO core/
-- mart/staging/meta schema at all (migrations 003-036 were never applied
-- there -- confirmed by direct catalog inspection, not ledger names --
-- see warehouse/reports/sprint18_migration_reconciliation.md and
-- sprint18_2_schema_fingerprint_and_046_ordering.md).
--
-- Deliberately does NOT create:
--   - a `staging` schema -- the minimum contract (traced via pg_depend for
--     the 10 research views and a regex over pg_get_functiondef() for the
--     8 plpgsql functions granted by migration 046) reads zero staging
--     tables. Staging is a transient ETL landing zone only.
--   - the `postgis` extension -- traced the same way: none of the 18
--     granted objects reference PostGIS in any form. The only geometry
--     column in the whole warehouse (core.dim_geography.geom) is used only
--     inside the ETL pipeline to derive the plain centroid_lat/centroid_lon
--     numeric columns that are actually read at query time. See
--     warehouse/reports/sprint18_2_minimum_launch_contract.md.
--
-- This migration is applied to Production BEFORE existing migration
-- 046_research_api_grant_hardening.sql, which is applied unmodified and
-- last in this bootstrap sequence (046 references views/functions that
-- migrations 049-052 create; Supabase orders migrations by real
-- apply-timestamp, not filename number, so this ordering is fully
-- supported -- no ledger rewriting, no fabricated timestamps).

create schema if not exists core;
create schema if not exists mart;
create schema if not exists meta;
