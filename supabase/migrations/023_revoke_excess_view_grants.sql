-- ============================================================
-- Propellect — Revoke excess grants on warehouse public views (Sprint 11, WS17)
--
-- Live audit found that every warehouse public.v_* view carries
-- INSERT/UPDATE/DELETE/TRUNCATE grants to anon/authenticated, even though
-- every migration that created these views only ever explicitly granted
-- SELECT. The extra grants come from Supabase's platform-level DEFAULT
-- PRIVILEGES on the public schema (ALTER DEFAULT PRIVILEGES ... GRANT ALL
-- ON TABLES TO anon, authenticated), applied automatically to every new
-- object created there — not something any migration in this project
-- asked for.
--
-- In practice these views are all JOIN-based (not auto-updatable) and
-- have no INSTEAD OF trigger, so a real INSERT/UPDATE/DELETE attempt
-- against them would already fail at the database level. This migration
-- closes the gap explicitly rather than relying on that implementation
-- detail — defense in depth, matching this project's "no anonymous
-- writes" hard rule literally, not just practically.
--
-- Scope: only the warehouse-specific views (public.v_*). The application's
-- own tables (portfolio_properties, watchlist_items, strategy_generations,
-- etc.) are a pre-existing, separate concern outside this warehouse
-- security audit's scope — documented in database_security_audit.md, not
-- touched here.
-- ============================================================

revoke insert, update, delete, truncate on public.v_dataset_freshness_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_market_geography_search_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_metric_assumptions_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_postcode_demographic_profile_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_postcode_market_snapshot_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_refresh_run_history_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_suburb_demographic_profile_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_suburb_market_snapshot_v1 from anon, authenticated;

-- Also close the default-privilege gap going forward: any future object
-- created in public by the migration-running role should not automatically
-- get INSERT/UPDATE/DELETE/TRUNCATE granted to anon/authenticated. This
-- does not retroactively affect already-created objects (handled above);
-- it only changes what happens the next time something new is created.
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;
