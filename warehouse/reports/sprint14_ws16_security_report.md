# Sprint 14 Workstream 16 — Security and Privacy Hardening

## Real gap found and fixed: zero security headers configured

Verified directly (not assumed): `next.config.ts` had no `headers()`
function and `middleware.ts` set no response headers — this app shipped
with **no CSP, no X-Frame-Options, no X-Content-Type-Options, no
Referrer-Policy, no Permissions-Policy** at all, at any point before
this workstream.

Added a real, scoped (not copy-pasted generic) policy in
`next.config.ts`:
- **CSP** scoped to this app's actual origins: `self`, Supabase
  (`*.supabase.co` + `wss://` for realtime), OpenStreetMap tiles
  (`*.tile.openstreetmap.org`, the exact domain `MarketMapExplorer.tsx`
  uses), Vercel Analytics script + collector. `frame-ancestors 'none'`
  blocks clickjacking. Anthropic is called server-side only and
  correctly needs no browser CSP allowance.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` denying camera/microphone/geolocation (none used).
- `script-src`/`style-src` keep `'unsafe-inline'` — Next.js's hydration
  bootstrap and Tailwind's inline styles need it without a nonce-based
  setup. A stricter nonce CSP is real, separate follow-on work,
  deliberately not attempted here since it carries real breakage risk
  without exhaustive per-route browser testing.

**Live-verified, not just built**: started the dev server, confirmed
all 5 headers present via `curl -D -`, then browser-tested the two
highest-risk pages:
- `/research/map` — Leaflet/OpenStreetMap tiles: 15 tiles loaded
  successfully, map container rendered. One expected, harmless dev-mode
  console message ("`eval()` is not supported... React will never use
  `eval()` in production mode") — this is React's own dev-only debug
  tooling being blocked by the CSP's lack of `unsafe-eval`, which is
  correct and expected; the message itself confirms production never
  needs it, so `unsafe-eval` was deliberately NOT added.
- `/watchlist` — exercises the Supabase auth check (`connect-src`):
  loaded clean, zero errors.

4 tests added (`next.config.test.ts`) asserting the header set's shape
and content, not just that headers() exists.

## Real gap found and fixed: zero tests existed for any `/api/v1/*` route handler

Verified directly: `find app/api/v1 -name "*.test.ts"` returned nothing
— only the shared gate/envelope helper (`lib/warehouse/apiV1.test.ts`)
was tested, never the individual routes that actually decide how much
data a caller can pull per request. This is exactly the "unrestricted
warehouse queries" risk the brief calls out.

Added `app/api/v1/compare/route.test.ts` (5 tests) and
`app/api/v1/search/route.test.ts` (5 tests), proving:
- `/api/v1/compare` rejects >10 geographies **before** ever calling the
  warehouse (not truncated silently downstream).
- `/api/v1/search` clamps a requested `limit=100000` down to the
  documented 100-row cap, clamps 0/negative limits to the sane default
  of 20 (not to "unlimited," a real footgun some libraries have),
  ignores a non-numeric limit rather than passing `NaN` through, and
  only accepts `NSW`/`VIC` as a jurisdiction filter.
- Both routes gate on `PUBLIC_API_V1_ENABLED` before touching the
  warehouse at all, confirmed by asserting the mocked warehouse function
  was never called on the flag-off path.

## Re-verified, unchanged from Sprint 13 (not re-fixed, confirmed still true)

- `npm audit`: same 3 low-severity, deliberately-not-force-fixed
  vulnerabilities as Sprint 13's final state (nested `sharp`/`postcss`,
  `uuid` via `exceljs`) — no new vulnerabilities introduced this sprint.
- Bundle/secret scan of `.next/static`, verbose-error grep across
  `app/api/**/*.ts`, SQL-injection grep: all re-run this pass, all clean.
- Entitlement self-elevation protection
  (`app/api/account/entitlements/route.test.ts`): still passing, still
  proves a client-supplied `?tier=` param is ignored.
- Static RLS coverage (`warehouse:rls:check`): still passing, 10 tables.

## Cookie configuration

`lib/supabase/client.ts`/`server.ts` use `@supabase/ssr`'s own defaults
with no insecure overrides (verified: no explicit `secure: false` or
similar anywhere in the codebase) — the library's defaults are
appropriate for a production HTTPS deployment. Not flagged as a gap.

## Admin-route protection

No admin-specific routes exist yet in this codebase (that's Sprint 14
Tier 4's WS15/WS20 scope) — nothing to protect yet, so nothing to test
yet. Will be covered when those workstreams are reached.

## Not done this pass (explicitly deferred, not hidden)

- Nonce-based CSP (would remove `'unsafe-inline'`) — real follow-on
  work, deferred to avoid breakage risk without full per-route browser
  coverage in this pass.
- Distributed rate limiting (still best-effort/in-memory, per Sprint 13).
- DoS/load testing (out of this workstream's scope; a code-review pass,
  not a load-testing exercise).

## Validation

`npm run lint` (0 errors), `npm run build`, `npm run test`
(**311/311**, +14 from this workstream), `npm run warehouse:check`,
`npm run warehouse:rls:check` — all pass.
