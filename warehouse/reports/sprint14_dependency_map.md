# Sprint 14 — Dependency Map

## Cross-workstream dependencies

- **WS12 (entitlements enforcement)** depends on Sprint 13's
  `lib/auth/entitlements.ts` schema (done) and `user_entitlements` table
  (now live in production, verified in the baseline report). No new
  schema needed, only enforcement logic + tests.
- **WS5 (AI copilot)** depends on a deterministic evidence/retrieval
  layer built from the *existing* warehouse query functions
  (`lib/warehouse/queries.ts`) — no new data source. Must be built
  before any natural-language layer is wired on top, per the brief's own
  instruction.
- **WS9 (watchlist v2)** depends directly on Sprint 13's
  `lib/warehouse/watchlistChanges.ts` (detection logic) and
  `watchlist_change_events` table (both live) — this is pure extension,
  no new foundation required.
- **WS6/WS7 (property analysis v2 / Scenario Lab v2)** depend on the
  existing `lib/warehouse/affordability.ts` formula library (extend, not
  replace) and the existing Budget 2026 tax modules
  (`lib/tax/budget2026*.ts`, confirmed live on this branch) for any
  tax-aware scenario work.
- **WS11 (report builder)** depends on Sprint 13's
  `lib/export/researchReport.ts` and `lib/export/csvSafety.ts` — extends
  the bundle model rather than building a new export pipeline.
- **WS23 (release engineering)** and **WS25 (final audit)** depend on
  whatever subset of WS1-WS22 actually ships this pass — written last,
  against real state.

## External dependencies (all already satisfied, none new needed)

- Supabase (production + warehouse-validation branch) — existing.
- Vercel (CLI-authenticated, Preview env configured) — existing.
- `ANTHROPIC_API_KEY` — already present in both Production and Preview
  env (used by the existing Strategy Generator) — the only candidate
  provider WS5 may reuse, never a new one.
- No new npm packages are anticipated for Tier 1-2 work; any candidate
  for Tier 3 (WS5 especially) will be evaluated against the "prefer zero
  new runtime dependencies" rule in the risk register before being added.

## Sequencing constraint

WS16 (security) is scheduled early specifically because WS12
(entitlement enforcement) and WS5 (AI copilot, with its own prompt-
injection/abuse-protection requirements) both have security-sensitive
surfaces that are cheaper to build correctly from a verified-clean
baseline than to retrofit after the fact.
