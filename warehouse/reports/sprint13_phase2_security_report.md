# Sprint 13 Phase 2 — Security Hardening Report (Workstream 13)

Full-diff security pass across the whole repository (not just Phase 1/2's
new surface — this workstream is explicitly the broader audit).

## Findings and fixes

### 1. CSV/formula injection (CWE-1236) — fixed

Two independent CSV-generation code paths (`ExportButtons.tsx`
client-side export, `exportBundleToCsv()` in `lib/warehouse/queries.ts`
server-side) quoted commas/quotes/newlines but never guarded against a
cell value starting with `=`, `+`, `-`, `@`, tab or CR — the classic
Excel/Sheets/LibreOffice formula-injection vector. Real risk once
user-controlled free text (watchlist notes, scenario labels, saved
report names) started flowing into exports this sprint.

**Fix**: new shared `lib/export/csvSafety.ts` (`csvCell()`), both export
paths now use it. Scoped to `typeof v === "string"` only — a genuine JS
`number` (e.g. a negative cashflow figure) can never carry formula
syntax, so numeric cells are never mangled. 8 tests, including a case
that distinguishes a real negative number (untouched) from a string that
merely looks like one and carries an injection payload (guarded).

### 2. Missing rate limiting on 3 new API routes — fixed (best-effort)

`/api/research/search-suggest`, `/api/analyse/suburb-suggestions`
(unauthenticated-accessible) and `/api/watchlist/refresh-changes`
(authenticated, fans out one warehouse query per geography-linked
watchlist item) had no rate limiting.

**Fix**: new `lib/security/rateLimiter.ts` — an in-memory sliding-window
limiter. Explicitly documented as best-effort/single-instance, not a
distributed limiter: Vercel serverless functions are stateless across
cold starts and concurrent instances, so this only bounds abuse within
one warm instance's lifetime. A production-grade distributed limiter
(e.g. Upstash Redis) is new infrastructure and requires explicit
approval per this project's guardrails — not introduced here. 5 unit
tests plus a live 429-after-60-requests test on `search-suggest`.

### 3. Dependency vulnerabilities — partially fixed, rest documented

`npm audit` found 4 vulnerabilities before this pass (1 moderate: `ws`
memory issues; 3 tied to Next.js: cache confusion, SSRF via rewrites,
unbounded Server Action payload, unauthenticated internal Server
Function endpoint disclosure, DoS via SVG image optimization).

- `npm audit fix` (non-force) fixed the `ws` issue cleanly, no range change.
- Upgraded `next` 16.2.3 → 16.2.11 (patch-only within the same major/minor
  line) and `eslint-config-next` to match — this fixed every Next.js CVE
  listed above. Verified safe: full clean build, 279/279 tests, lint
  (0 errors, same 6 pre-existing warnings) all pass after the upgrade.
- **Remaining, deliberately not forced**: `postcss`/`sharp` (nested,
  build-time-only dependencies of Next.js itself — `sharp` isn't even a
  direct dependency of this project) and `uuid` (via `exceljs`). npm's
  own suggested "fix" for these is to force-downgrade `next` to `9.3.3`
  or `exceljs` to `3.4.0` — both would be severe regressions reintroducing
  the just-fixed, more severe CVEs, or breaking export functionality.
  Not applied. These three are accepted, low-severity, tracked items for
  a future dependency-maintenance pass, not silently ignored.

### 4. Bundle/secret scan — clean

Scanned `.next/static` (the actual client-shipped bundle) for
secret-shaped strings (`sk-ant-`, `service_role` JWTs, Postgres
connection strings, AWS-style keys) and for the literal names of
server-only env vars (`ANTHROPIC_API_KEY`, `WAREHOUSE_VALIDATION_DB_URL`,
`SUPABASE_SERVICE_ROLE`) — zero matches in either scan.

### 5. Verbose error leakage — clean

Grepped every `app/api/**/*.ts` route for `error.message`/`error.stack`
being returned in a response — zero matches. Every route returns a
fixed, safe error string (`"not found"`, `"server_misconfigured"`,
`"unauthorized"`, etc.), never the underlying exception's own text.

### 6. SQL injection — clean

Grepped for raw SQL string concatenation with request input anywhere in
`app/` or `lib/` — zero matches. Every database call goes through
Supabase's parameterized query builder or `.rpc()` with named
parameters; no string-built SQL with request data exists in
user-facing code paths (warehouse maintenance scripts under
`warehouse/scripts/` are trusted internal tooling, not user-facing, and
were already covered by Sprint 1-12's own guardrail scripts).

## Carried-forward, already covered elsewhere

- RLS coverage — `warehouse:rls:check`, all 10 public tables, see Phase
  1/2 checkpoints.
- Feature-flag server-side enforcement — see Phase 1's security report
  and this phase's entitlement-bypass tests (Workstream 11).
- Auth boundaries, object-level authorisation, service-role exposure —
  see Phase 1's security report (unchanged conclusions, re-verified
  clean this pass via the same grep-based checks).

## Not done this pass (explicitly out of scope, not silently skipped)

- Denial-of-service load testing (this is a code-review/static pass, not
  a load-testing exercise — see Workstream 14 for performance measurement).
- Map/query bounding — already covered by existing 2-10 geography caps
  and the 500-marker cap on map queries (Sprint 11/12 work, re-verified
  present, not re-audited line-by-line this pass).
- A distributed rate limiter (see finding 2 above — requires new paid
  infrastructure and explicit approval).
