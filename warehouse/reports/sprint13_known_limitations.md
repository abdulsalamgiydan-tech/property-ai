# Sprint 13 — Known Limitations

Consolidated from every workstream's own report. This is the single
place to check before inviting real beta users.

## Data coverage

- NSW/VIC only have suburb-level sales+rent; QLD/SA/WA have rent only
  (sales paid/restricted at source); TAS/ACT/NT have GCCSA-grain sales
  only, no rent, no yield.
- Land values, vacancy rate, planning pipeline: unavailable everywhere.
- VIC rent has no time series, only a latest-value snapshot.

## Testing

- RLS is verified by static SQL-text checks (`warehouse:rls:check`), not
  live cross-user integration tests — no safe non-production branch
  exists for the main app schema (unlike the warehouse-validation branch).
- Authenticated flows (watchlist geography-linked add, Scenario Lab save)
  were not exercised as a signed-in user in a live browser this sprint —
  no magic-link email round-trip available in this environment.

## Features intentionally deferred, not forgotten

- Comparison's historical/trend-over-time view (snapshot comparison only).
- Watchlist "About this metric" / full explainability audit beyond
  Phase 1's placements.
- Entitlement tiers (Free/Research/Investor Pro/Professional) are schema
  only — nothing is gated by tier, no billing.
- Notification preferences are schema only — no email/SMS/push is ever
  sent by this codebase.
- Watchlist change detection runs on-demand (page visit), not on a
  schedule — no background job or cron.
- Rate limiting on new API routes is best-effort/in-memory,
  single-instance — not a distributed limiter.

## Infrastructure

- The Vercel MCP connector (used by some Claude tooling) has a stale
  session; the CLI works fine and was used for all of Workstream 19.
  Re-authorizing the MCP connector is a separate, optional human step
  (see `sprint13_ws1_vercel_deployment_access_report.md`).
- Production and Preview share the same Supabase project for the main
  app schema (auth, property_reports, watchlist_items, etc.) — only the
  warehouse-specific env vars are Preview-scoped. This is pre-existing
  architecture, not something Sprint 13 introduced, and it's why
  Workstream 21's migration-application step went to production directly
  (with your explicit approval) rather than a safer branch.
- 3 low-severity dependency vulnerabilities remain, deliberately not
  force-fixed since the suggested fix is a severe regression (downgrading
  Next.js to 9.3.3 or exceljs to 3.4.0) — see
  `sprint13_phase2_security_report.md`.

## Accessibility

- Colour contrast, dark/light mode, and reduced-motion handling were not
  re-audited on pre-existing (non-Sprint-13) components.

## Cost model

- Every dollar figure in `sprint13_cost_model.md` is a rough
  order-of-magnitude estimate — there is no production traffic yet to
  measure real costs from.
