# Preview Configuration Attestation Report

Generated: 2026-07-24 23:55 AEST

## Result

PASS.

The previous JavaScript-bundle inference check was replaced with a server-side Preview-only diagnostic endpoint that derives its answer from the active runtime environment.

## Endpoint

- Path: `/api/diagnostics/preview-config`
- Production behavior: 404 fail-closed.
- Preview behavior: returns only safe redacted identifiers.
- Protection: normal Vercel Deployment Protection remains active; direct unauthenticated HTTP returned 302 to Vercel SSO.

## Final Deployment Attested

- Deployment ID: `dpl_7ShCWjiUb2VcX4a97ZtLETcNva2M`
- Deployment URL: `https://property-fbas0vrqs-zeebusiness93-2304s-projects.vercel.app`
- Stable alias: `https://property-ai-git-feature-spr-48904f-zeebusiness93-2304s-projects.vercel.app`
- Target: Preview
- Branch: `feature/sprint14-production-readiness`
- Commit: `5f52efb1cf9de0dc9febb8e417fb18bf5fdfc3c2`
- Build status: Ready

## Attestation Findings

- App Supabase project ref: redacted warehouse-validation ref `lzon...oems`.
- Warehouse Supabase project ref: redacted warehouse-validation ref `lzon...oems`.
- Production Supabase ref detected: false.
- `WAREHOUSE_PREVIEW_ENABLED`: true.
- `MULTI_STATE_RESEARCH_ENABLED`: true.
- `DATA_OPERATIONS_ENABLED`: true.
- `SCENARIO_LAB_ENABLED`: true.
- `PUBLIC_API_V1_ENABLED`: true.
- `RESEARCH_COPILOT_ENABLED`: false.
- `ADMIN_EMAILS` configured: false.
- `SUPABASE_SERVICE_ROLE_KEY` configured in deployed Preview: false.

The endpoint did not return full Supabase URLs, Supabase keys, service-role keys, tokens, cookies, passwords, or bypass secrets.
