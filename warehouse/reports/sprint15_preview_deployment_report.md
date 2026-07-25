# Sprint 15 Preview Deployment Report

Generated: 2026-07-24 22:26 AEST

## Status

**Preview deployed and verified.**

- Stable Preview alias: `https://property-ai-sprint15-uat-zeebusiness93-2304s-projects.vercel.app`
- Deployment URL: `https://property-cmtjd1ayc-zeebusiness93-2304s-projects.vercel.app`
- Deployment ID: `dpl_4oRRX1QyDWFLFU4MxSRKdrkPFqZu`
- Target: Preview
- Status: Ready
- Created: 2026-07-24 09:39:33 AEST
- Branch: `feature/sprint14-production-readiness`
- Commit: `a22f8175fe90ab152fdf582b4a685c09f89e01e4`

## Protection

Vercel Deployment Protection remained active. Unauthenticated requests remained protected, and automated UAT used the supported Protection Bypass for Automation mechanism without printing or storing the bypass secret.

## Environment

Preview browser bundle pointed to the non-production `warehouse-validation` Supabase branch:

- Supabase branch ref: `lzonauinzatmtytyoems`
- Production Supabase ref rejected by harness: `oshquaxsloolqucwvigc`

Production-scoped Vercel variables were not modified in this workflow. `RESEARCH_COPILOT_ENABLED`, `ADMIN_EMAILS`, and browser-exposed privileged keys remained unset for the tested Preview posture.

## Verification

- Live HTTP and browser UAT passed against the stable alias.
- Live bundle scan found no privileged secret markers.
- Admin and copilot disabled routes failed safely.
- No duplicate Vercel project was created.
- No Production deployment or promotion was performed.

