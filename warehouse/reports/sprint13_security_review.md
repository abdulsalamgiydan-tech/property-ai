# Sprint 13 — Security Review (Consolidated)

Full detail lives in `sprint13_phase1_security_report.md` and
`sprint13_phase2_security_report.md`. This is the summary + the final
production-database verification from Workstream 21.

## Verified this sprint

- **RLS**: all 10 `public.*` tables (6 pre-existing + 4 new this sprint)
  statically verified via `warehouse:rls:check` — every table has RLS
  enabled and the correct `auth.uid() = user_id` policy shape (or a
  documented, reasoned exception: `waitlist`, `strategy_generations`,
  `user_entitlements`). **Independently re-confirmed against the live
  production database this pass** (Workstream 21) via
  `mcp__claude_ai_Supabase__get_advisors` after applying migrations
  037-040 — zero new security lint warnings introduced by any Sprint 13
  table.
- **CSV/formula injection** (CWE-1236): fixed in both export paths,
  scoped to string cells only (never mangles real numbers), 8 tests.
- **Feature-flag bypass**: every new route gates server-side before
  touching auth/DB; tested explicitly for `search-suggest`,
  `suburb-suggestions`, `refresh-changes`, and `account/entitlements`
  (the latter two gained tests specifically during Workstream 18's gap
  audit — the flag mocks had been hardcoded to always-true, silently
  untested).
- **Entitlement self-elevation**: `user_entitlements` has no
  insert/update/delete policy for the authenticated/anon role — only
  `service_role` can change a user's tier. Tested that a client-supplied
  `?tier=` query param cannot influence the API's response.
- **Dependency vulnerabilities**: Next.js upgraded 16.2.3 → 16.2.11,
  fixing 4 real CVEs (SSRF via rewrites, cache confusion, unbounded
  Server Action payload, unauthenticated internal endpoint disclosure).
  3 low-severity, nested/build-time-only issues remain, deliberately not
  force-fixed (see phase 2 report for why).
- **Bundle/secret scan**: `.next/static` scanned for secret-shaped
  strings and server-only env var names — clean.
- **Rate limiting**: best-effort in-memory limiter added to the 3 newest
  API routes, explicitly documented as single-instance (not distributed).

## Production database verification (Workstream 21)

Independently queried the production Supabase database (read-only,
before any change) and found migrations 037-040 had never been applied
— a genuine gap between "the SQL is correct" and "the feature works."
**With your explicit approval**, applied all 4 migrations to production:

- Confirmed via `information_schema` queries before and after that each
  table/column now exists exactly as the migration files specify.
- Confirmed via `get_advisors(type=security)` that no new RLS or
  security lint issue was introduced.
- All 4 migrations are additive only — no `DROP`/`TRUNCATE`/`DELETE` —
  matching the static check already run on every commit.

## Not done this sprint (explicitly out of scope)

- Live cross-user RLS integration testing (no safe non-prod branch for
  the main app schema).
- DoS/load testing.
- A distributed rate limiter (new infrastructure, needs approval).
- Full-app colour-contrast audit on pre-existing components.
