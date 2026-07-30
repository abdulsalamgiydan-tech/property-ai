# Sprint 17 Research Warehouse Contract and Rehearsal

Generated: 2026-07-25 21:20 Australia/Sydney

## Target

- Branch: `feature/sprint17-major-product-expansion`
- Starting commit for this pass: `cbd37be009e1849bbcaf49a2f25c254b4e66cc21`
- Non-Production Supabase branch verified: `warehouse-validation` / `lzonauinzatmtytyoems`
- Production ref explicitly excluded: `oshquaxsloolqucwvigc`
- Production changes: none

## Findings

The application already depends on the public warehouse contract created by earlier migrations, not on a new parallel schema. Live warehouse-validation inspection confirmed the required views/RPCs exist and have populated non-Production data:

- `v_market_geography_search_v1`: 17,975 rows
- `v_dataset_freshness_v1`: 7 rows
- `v_evidence_catalogue_v1`: 13 rows

The issue found during contract reconciliation was grant hygiene on older public views: `anon`/`authenticated` showed extra `REFERENCES`/`TRIGGER` privileges from older defaults. Migration `046_research_api_grant_hardening.sql` normalizes curated research views to `SELECT` only and bounded RPCs to `EXECUTE` only.

## Migrations Rehearsed On Warehouse-Validation

- `045_sprint17_preferences_feedback_controls`: applied in 504 ms.
- `046_research_api_grant_hardening`: applied in 418 ms.

`045` initially failed rehearsal because a legacy non-Production feedback row used category `idea`. The migration was corrected to preserve the legacy category in the DB constraint while the application submission schema continues to emit only `bug`, `feature_request`, `general`, and `other`.

## Validation Evidence

After `045`:

- New onboarding columns present: `strategy_focus`, `investment_timeframe`, `completion_step`, `last_edited_from`.
- New feedback columns present: `client_submission_id`, `satisfaction_score`, `status`, `technical_context`.
- New indexes present: `user_feedback_user_submission_id_idx`, `user_feedback_status_created_idx`.

After `046`:

- Sample view grants for `anon` and `authenticated` are `SELECT` only.
- `get_market_snapshot_v2`, `compare_market_geographies_v1`, and `get_market_map_markers_v1` remain `SECURITY DEFINER` with pinned `search_path`.
- `anon` can select curated research views.
- `anon` cannot write to curated views.
- `anon` cannot directly read `mart` schema.
- Malformed comparison input rejects before returning data.
- Invalid map bounding boxes and invalid geography types reject.

## Contract Matrix

See `warehouse/reports/sprint17_research_contract_matrix.json` for route/object/column/grain/unit/null/freshness/lineage/confidence/access/index/status details.

## Rollback

Rollback for `046` is to re-run the previous grants from migrations 014/016/017/022/033/035 if broader role grants are intentionally required. That is not recommended: the hardened state is lower privilege and the app only requires `SELECT` on views plus `EXECUTE` on RPCs.

Rollback for `045` is not required for Preview; it is additive columns/indexes/check constraints on existing user-owned tables. If a future Production rollback is required before any data depends on these fields, drop the added constraints, indexes, and columns from `user_onboarding_preferences`/`user_feedback` in reverse order.
## Clean Replay Evidence

Manual GitHub Actions workflow dispatch passed on exact head `e6437ab5cb72cfae04703bbe90d827d1cc955bdb`.

- Run: `30156081474`
- Event: `workflow_dispatch`
- Standard validation job: success
- Blank database replay job: success
- Migration count: 46
- First migration: `001_propellect_schema.sql`
- Last migration: `046_research_api_grant_hardening.sql`
- Deterministic order: true
- Missing required tables: none
- User-owned RLS missing: none
- Redacted artifact downloaded outside Git to `C:\tmp\sprint17-clean-replay-artifact\clean-migration-chain-report.json` for local inspection only.

## Upgrade Replay Evidence

Warehouse-validation was independently verified as non-Production (`lzonauinzatmtytyoems`) before applying Sprint 17 migrations. The branch already carried the Sprint 15 application tables and a branch-only RLS performance migration. Applying local `045_sprint17_preferences_feedback_controls` and `046_research_api_grant_hardening` completed successfully without Production access or data fabrication. This proves the 044-to-final application path for the current non-Production rehearsal branch; a final Production approval pack must still re-check the exact Production ledger before any Production migration.
