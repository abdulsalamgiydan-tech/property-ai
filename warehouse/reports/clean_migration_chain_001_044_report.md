# Clean Migration Chain 001-044 Report

Generated: 2026-07-24 23:55 AEST

## Result

PASS.

The clean replay was run in an ephemeral GitHub Actions workflow from a blank local PostGIS database, not against Production and not against `warehouse-validation`.

## Evidence

- Workflow: `Warehouse Validation`
- Run: `30129753693`
- Commit: `6a9f2a0ee10542d7fb3d2be8f0e939937b3487be`
- Job: `Replay migrations 001-044 from blank database`
- Result: success
- Artifact: `clean-migration-chain-001-044-report`
- Database host: `localhost`
- Migration count: 44
- First migration: `001_propellect_schema.sql`
- Last migration: `044_user_feedback.sql`
- Total replay duration reported by harness: 939 ms

## Final State Checks

- Migration ordering: deterministic `001` through `044`.
- Required tables present: `property_reports`, `research_copilot_queries`, `scenario_lab_cases`, `user_entitlements`, `user_feedback`, `user_onboarding_preferences`, `watchlist_items`.
- User-owned RLS tables checked: 13.
- Missing RLS on checked user-owned tables: none.
- Public policies: 46.
- Public functions: 21.
- Public triggers: 6.
- Schema tables across checked schemas: 67.
- Schemas present: `core`, `mart`, `meta`, `public`, `staging`.

## Harness Fix

The first replay attempt exposed an environment fidelity issue: the generic PostGIS container preloaded PostGIS into `public`, while the committed migrations expect Supabase's `extensions.geometry` layout. The replay harness now resets PostGIS only inside the disposable blank database before applying committed migrations, then recreates it in `extensions`.

No Production database, Production Auth, or Production Vercel setting was modified.
