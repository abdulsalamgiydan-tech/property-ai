# Sprint 15 Release Evidence

Generated: 2026-07-24 22:20 AEST

## Verified State

- Branch: `feature/sprint14-production-readiness`
- Commit under Preview UAT: `a22f8175fe90ab152fdf582b4a685c09f89e01e4`
- PR: #23, draft, open, unmerged
- Preview deployment: `dpl_4oRRX1QyDWFLFU4MxSRKdrkPFqZu`
- Preview URL: `https://property-ai-sprint15-uat-zeebusiness93-2304s-projects.vercel.app`
- Vercel target: Preview
- Supabase Preview branch: `warehouse-validation`
- Supabase Preview ref: `lzonauinzatmtytyoems`
- Production Supabase ref: `oshquaxsloolqucwvigc`

## Local Verification

| Command | Result |
|---|---|
| `npm run lint` | PASS, 0 errors, 6 warnings |
| `npm run test` | PASS, 49 files, 442 tests |
| `npm run build` | PASS |
| `npm run warehouse:check` | PASS |
| `npm run warehouse:rls:check` | PASS |
| `npm run warehouse:lineage:check` | PASS |
| `node tests/uat/sprint15-preview-browser-uat.mjs` | PASS, 16 live Preview checks |

## Security Evidence

- Live bundle scan found the Preview public Supabase URL for `lzonauinzatmtytyoems`.
- Live bundle scan did not find the production Supabase ref.
- Live bundle scan did not find privileged secret markers for service-role keys, database URLs, database passwords, Anthropic keys, or Vercel bypass material.
- RLS was tested through actual browser-originated Supabase REST requests.
- User A could not read or mutate User B data.
- User B could not read or mutate User A data.
- Self-elevation through `user_entitlements` was rejected.
- Admin and copilot routes failed safely while disabled.

## Production Evidence

- No production deployment command was run.
- No merge to `main` was performed.
- No Production Vercel env var was changed.
- No Production Auth user was created, updated or deleted.
- No Production database mutation was performed.
- Migrations 042/043/044 remain ready for separate approval; they were not applied to Production in this workflow.

## Outstanding Decisions

- Abdul must decide whether PR #23 should leave draft status.
- Abdul must separately approve any Production migration application.
- Abdul must separately approve any Production deployment.
- Abdul must separately approve admin enablement.
- Abdul must separately approve copilot enablement.

