# Sprint 15 Production Change Plan

Generated: 2026-07-24 22:25 AEST

## Status

**Do not execute production changes until Abdul approves them separately.**

The core release candidate has passed Preview deployment verification and live authenticated Preview UAT. Production deployment remains a separate human-approved action.

## Preconditions Before Production

1. Abdul explicitly approves PR #23 leaving draft status and merging.
2. Abdul explicitly approves whether migrations 042/043/044 are applied to Production.
3. Abdul explicitly approves any Production Vercel deployment or promotion.
4. Confirm copilot and admin remain disabled unless separately approved.
5. Reconfirm Production env names before deployment; do not copy Preview branch-scoped values into Production without explicit approval.

## Production Database

- Current approved production state remains migrations through 041 only, per prior verified Sprint 15 reports.
- Migrations 042/043/044 are code-ready for separate approval but were not applied to Production in this workflow.
- Required post-migration checks: role grants, RLS policies, Supabase advisors/security checks, and app smoke.

## Vercel

- Do not run `vercel deploy --prod` without explicit approval.
- Do not promote Preview to Production without explicit approval.
- Keep Deployment Protection active.
- Keep `RESEARCH_COPILOT_ENABLED`, `ADMIN_EMAILS`, and Production `SUPABASE_SERVICE_ROLE_KEY` unset unless Abdul makes separate explicit decisions.

## Rollback

No Production rollback is needed because no Production deployment, Production env edit, Production DB migration, Production Auth mutation, or merge to `main` was performed.

