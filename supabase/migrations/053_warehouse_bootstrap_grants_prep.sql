-- Sprint 18.2 -- Production warehouse bootstrap, Phase 8, step 6 of 8.
--
-- (Migration 053 in the original Phase 8 plan was a standalone "indexes"
-- file; every index ended up naturally co-locatable with its owning
-- table's CREATE TABLE statement in migrations 049-051, so that step is a
-- no-op and was folded away rather than left as an empty placeholder file
-- -- this migration takes its number to keep the ledger contiguous, which
-- scripts/clean-migration-replay.mjs's migrationFiles() strictly requires.)
--
-- Schema-level access hardening applied BEFORE existing migration
-- 046_research_api_grant_hardening.sql, so that 046's own final line
-- (`revoke all on schema core, mart, staging, meta from anon,
-- authenticated;`) is idempotent/harmless rather than the first time this
-- revoke has ever happened on Production -- mirroring the exact pattern
-- migrations 014/023 already established for warehouse-validation.
--
-- Also grants service_role the privileges the snapshot :import tool needs.
-- service_role already bypasses RLS entirely (standard Supabase BYPASSRLS
-- role attribute) but still needs schema/table-level grants to read/write
-- at all -- RLS and grants are independent access-control layers.

revoke all on schema core, mart, meta from anon, authenticated;

grant usage on schema core, mart, meta to service_role;
grant select, insert, update on all tables in schema core, mart, meta to service_role;
