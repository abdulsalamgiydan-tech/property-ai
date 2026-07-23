# Sprint 15 Production Change Plan

Generated: 2026-07-24 09:35 AEST.

## Status

**Do not execute production changes yet.**

Preview is deployed and HTTP-smoke verified, but full live browser UAT is still blocked. Production deployment remains a separate human-approved action after browser UAT.

## Preconditions before production

1. Complete full live Preview UAT through an authenticated browser session.
2. Keep PR #23 draft until UAT passes.
3. Confirm migrations 042/043/044 are approved separately.
4. Confirm whether copilot and admin remain disabled for initial production release.
5. Reconfirm Production env names before any deployment; do not copy Preview branch-scoped values into Production without explicit approval.

## Production database

- Current approved production state remains migrations through 041 only, per prior verified Sprint 15 reports.
- Migrations 042/043/044 are code-ready for separate approval, but were not applied to Production in this handoff.
- Required migration post-check: verify `information_schema.role_table_grants` for every new public table, then run Supabase advisors/security checks.

## Vercel

- Do not run `vercel deploy --prod`.
- Do not promote a Preview deployment to Production.
- Keep Deployment Protection active for Preview.
- Keep `RESEARCH_COPILOT_ENABLED`, `ADMIN_EMAILS`, and `SUPABASE_SERVICE_ROLE_KEY` unset unless Abdul makes separate explicit decisions.

## Rollback

No Production rollback was needed because no Production deployment, Production env edit, production DB migration, or merge to `main` was performed.

