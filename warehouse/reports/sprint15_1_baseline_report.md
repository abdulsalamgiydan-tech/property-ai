# Sprint 15.1 Baseline Report

Generated: 2026-07-24 23:12 AEST

## Repository

- Repository: `property-ai`
- Branch: `feature/sprint14-production-readiness`
- Starting commit: `610996641e3d23d5ffa5d3257a728c92656fb287`
- Working tree at baseline: clean
- PR #23: open, draft, unmerged
- PR base: `main`
- Latest CI at baseline: `Warehouse Validation` succeeded for `610996641e3d23d5ffa5d3257a728c92656fb287`

## Vercel Preview

- Current inspected deployment: `dpl_2cUWGgSnXsUXpHtu27inVsK4ydNz`
- Deployment URL: `https://property-2htlyz4ed-zeebusiness93-2304s-projects.vercel.app`
- Target: `preview`
- Status: Ready
- Branch-scoped Preview env names present: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `WAREHOUSE_SUPABASE_URL`, `WAREHOUSE_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `WAREHOUSE_PREVIEW_ENABLED`, `MULTI_STATE_RESEARCH_ENABLED`, `SCENARIO_LAB_ENABLED`, `DATA_OPERATIONS_ENABLED`, `PUBLIC_API_V1_ENABLED`
- `RESEARCH_COPILOT_ENABLED`, `ADMIN_EMAILS`, and `SUPABASE_SERVICE_ROLE_KEY` were not listed in the Preview branch-scoped environment variables.

## Supabase

- Production project ref: `oshquaxsloolqucwvigc`
- Production migration ledger at baseline: `remote_schema`, `037`, `038`, `039`, `040`, `041`
- Migrations `042`, `043`, and `044` are absent from Production.
- Existing non-production validation branch: `warehouse-validation`, ref `lzonauinzatmtytyoems`, non-default, parented to Production.

## Baseline Release Gaps

1. Full blank migration replay from committed migration `001` through `044` was not yet proven.
2. Latest live Preview UAT rerun failed before authentication because the harness could not deterministically attest the active Preview Supabase configuration from root-page JavaScript chunks.

## Guardrails Confirmed

- No PR merge.
- No Production deployment.
- No Production database migration.
- No Production Auth mutation.
- No Production Vercel environment variable modification.
- Admin and Copilot remain disabled.
