# Sprint 15 — Security Report

Consolidates every security-relevant finding and verification from
this sprint into one report.

## 1. Credential/bundle inspection — no privileged credential reaches the client

**Method**: not just static grep — a real local production build
(`npm run build` then `npm run start`, genuinely running `next start`,
confirmed by its startup banner, not a stale dev server) was inspected
both at the file level and by fetching actual rendered pages/JS chunks
over HTTP.

- Grepped the entire `.next/static/` (production client output) for
  `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `ANTHROPIC_API_KEY`,
  `WAREHOUSE_VALIDATION_DB_URL`: **zero matches**.
- Downloaded every JS chunk actually referenced by the production
  homepage (884KB combined) and searched the real, served bytes:
  **zero matches**.
- Fetched `/admin` and `/research/copilot/2000` from the real
  production server: both correctly return **404**, and their HTML
  bodies contain **zero** credential-shaped strings.
- One false-positive was investigated and ruled out: a **dev-mode-only**
  Turbopack cache chunk (`.next/dev/static/...@supabase_auth-js...`)
  contained the string `SUPABASE_SERVICE_ROLE_KEY` — traced to its
  exact source: a JSDoc *code comment* inside the `@supabase/auth-js`
  SDK's own source, illustrating example usage
  (`Authorization: Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`),
  not a real secret. Confirmed this comment does not survive into the
  actual production build's minified output at all (`.next/static/`
  has zero matches, and no chunk is even named `*supabase*` after
  production minification).
- `.next/` is gitignored (confirmed via `git check-ignore`); the only
  tracked `.env*` file in the repository is `.env.example`, which
  contains only placeholder values (confirmed by inspection).

**Conclusion**: no privileged credential (service-role key, admin
allowlist, Anthropic key, or warehouse-validation DB connection
string) reaches the client bundle, in either the source-level static
analysis or live production-server testing.

## 2. RLS and tier-enforcement — live-verified, not just statically checked

See `sprint15_authenticated_uat_report.md` for the full 9-test suite
run against real authenticated sessions on a confirmed non-production
database. Summary: cross-user read isolation, insert-impersonation
rejection, tier-aware volume limits (free vs. investor_pro), and
entitlement self-elevation rejection all passed.

## 3. Migration security re-verification (042/043/044)

See `sprint15_migration_validation.md` for full detail. Summary:
- Zero new `get_advisors` (security) findings attributable to any of
  the three new tables, both before and after the RLS performance fix.
- A real `auth_rls_initplan` performance issue was found (not a
  security hole, but flagged here for completeness since it was found
  via the security/performance advisor tooling) and fixed — see that
  report.
- The backfilled migrations (037-041, applied to the branch this
  session to reach full schema parity for UAT) were also re-checked:
  zero new security findings attributable to them either.

## 4. A real privilege-grant gap found and explained

See `sprint15_authenticated_uat_report.md`'s "side-finding" section.
Summary: applying migrations via the Supabase MCP `apply_migration`
tool to an existing branch does not automatically establish the same
default `anon`/`authenticated` table grants that Supabase's normal
production migration pipeline does. **Verified this does not affect
production** (production has full grants on every equivalent table,
confirmed by direct query) — it was specific to this session's branch-
only testing methodology, fixed on the branch, and documented as a
required pre-flight check for any future production migration
application via this tooling.

## 5. Environment-variable security posture

Consolidated in `sprint15_baseline_audit.md`'s environment-variable
reconciliation table. Summary of the two higher-risk vars:

- **`SUPABASE_SERVICE_ROLE_KEY`**: server-only by construction
  (`lib/supabase/adminClient.ts` imports `"server-only"`, which throws
  at build time if the module is ever imported into client-bundled
  code — verified this file is imported from exactly one place in the
  entire codebase, `app/admin/page.tsx`, via direct grep). Confirmed
  absent from every environment as of this report — the admin page is
  fully inert.
- **`ADMIN_EMAILS`**: explicit allowlist parsing, not a wildcard or
  regex — verified via `lib/auth/isAdminEmail.ts`'s implementation
  (`.split(",").map(trim/lowercase).filter(Boolean)`, then an exact
  `.includes()` check) and its 8 unit tests, including an explicit
  test that a superstring email (`founder@example.com.evil.com`) does
  **not** match an allowlist entry of `founder@example.com` — ruling
  out a substring-matching vulnerability.
- **`RESEARCH_COPILOT_ENABLED`**: confirmed strict `=== "true"` string
  equality (`lib/warehouse/env.ts`), so any absent, empty, or
  non-`"true"` value defaults to `false` — verified by reading the
  function body directly, not assumed from a prior report.

## 6. Outstanding, out-of-scope security items (flagged, not fixed)

- **7 tables already live in production** (`waitlist`,
  `portfolio_properties`, `property_comparisons`, `property_reports`,
  `strategy_reports`, `watchlist_items`, `strategy_generations`) have
  the same `auth_rls_initplan` performance pattern that was fixed in
  migrations 042/043/044 this sprint. Not fixed here — would require
  modifying already-live production RLS policies, which needs its own
  explicit approval and is out of scope for a migration-validation
  pass. Recommended as a future, small, low-risk workstream.
- **11 pre-existing `security_definer_view` findings** and **9
  pre-existing `security_definer_function_executable` findings** on
  warehouse-schema views/functions — all pre-existing (confirmed via
  this session's `get_advisors` calls, not new), already documented in
  earlier sprints' security reports as an accepted, intentional design
  (public research API functions need `SECURITY DEFINER` to read
  warehouse data the `anon` role wouldn't otherwise be granted). Not
  re-litigated here.
- **Dependency vulnerabilities**: `npm audit` shows 5 (3 high, 2
  moderate), all pre-existing, all in `sharp`/`libvips` (nested,
  build-time-only) and `uuid` via `exceljs`. Force-fixing requires
  breaking major-version upgrades to `next`/`exceljs` — the same
  standing decision from every prior sprint, re-confirmed unchanged
  this session.
