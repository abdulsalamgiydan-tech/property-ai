# Sprint 14 — Workstream 20: Beta Admin

## Scope decision (checked with the user before proceeding)

Any admin view that shows data across *all* users — who has an
upgraded tier, all submitted feedback — cannot be built with the
normal RLS-scoped Supabase client every other feature in this app uses
(RLS would restrict it to the admin's own rows only, same as any other
user). That requires either a Supabase **service-role key** (a new,
strictly more powerful credential type that bypasses RLS entirely —
not used anywhere in this codebase before this workstream) or a new
database-level "is admin" mechanism. Given the security sensitivity of
introducing a full-bypass credential, I asked the user how to scope
this before writing any code. They chose the service-role option,
scoped narrowly: read-only, server-only, gated by an env-var email
allowlist that defaults to empty (nobody is admin), with the key itself
never present in this project's env vars until a human explicitly adds
it.

## Scope delivered

1. **`lib/auth/isAdminEmail.ts`** (new) — pure function, no I/O.
   Case-insensitive, comma-separated `ADMIN_EMAILS` allowlist match.
   Empty/unset allowlist → nobody is admin, the safe default. 8 tests
   covering the empty-allowlist default, null/undefined email handling,
   multi-entry lists, case-insensitivity, whitespace tolerance, and
   explicitly confirming no partial/substring matching (an email
   containing an admin email as a substring must NOT match).
2. **`lib/supabase/adminClient.ts`** (new, `server-only`) —
   `createAdminSupabaseClient()`, a raw service-role client. Its own
   doc comment states explicitly, in capital letters, the load-bearing
   safety invariant: this function performs **no authorization check of
   its own** and must only ever be called after an admin check has
   already passed against the caller's real, authenticated session.
   Returns `null` (not a throwing client) when
   `SUPABASE_SERVICE_ROLE_KEY` isn't configured — which is the case in
   every environment this project currently has, so the admin page is
   inert by construction until a human operator adds the key.
   **Verified this session that `adminClient.ts` is imported from
   exactly one place in the entire codebase — `app/admin/page.tsx`** —
   confirmed via a direct grep before committing, not assumed.
3. **`app/admin/page.tsx`** (new) — the admin surface itself. Two
   independent gates, both required: (1) a real, authenticated Supabase
   session (verified via the normal RLS-scoped `createServerSupabaseClient()`
   + `getUser()` — never trusts a client-supplied claim of identity),
   and (2) the authenticated user's email must appear in
   `ADMIN_EMAILS`. Fails either gate → `notFound()`, never a
   403/permission-denied page — matching the "never reveal a gated
   route's existence" pattern already used for every feature-flag-gated
   page in this app all sprint. Only after both gates pass does the
   page call `createAdminSupabaseClient()`. Shows two read-only
   sections: upgraded entitlements (from `user_entitlements`, already
   live in production since migration 040/041) and recent feedback
   (from `user_feedback`, migration 044, not yet applied — degrades to
   a friendly "unavailable" message rather than crashing, same pattern
   used throughout this sprint for not-yet-applied migrations).

## What this workstream deliberately does NOT enable by itself

- `SUPABASE_SERVICE_ROLE_KEY` is not present in any of this project's
  Vercel environments today. This page is completely inert — every
  visitor, including the eventual admin, sees the "not configured"
  message — until that key is explicitly added by a human operator.
  This is a deliberate, separate decision from writing this code,
  exactly like every not-yet-applied migration this sprint.
- `ADMIN_EMAILS` is also unset. Even once the service-role key exists,
  nobody is treated as an admin until this second, independent env var
  is also explicitly configured.
- No write capability — tier changes, feedback moderation, and any
  other mutation still require the Supabase dashboard directly, as
  documented in the page's own on-screen copy. This keeps the
  blast radius of the new service-role credential to reads only.

## Testing

- `lib/auth/isAdminEmail.test.ts` (new): 8 tests, described above.
- Full suite: 416/416 passing (up from 408 after WS21).
- `npx eslint`: clean.
- `npm run build`: passes; `/admin` route confirmed present in build
  output.
- `npm run warehouse:check` / `npm run warehouse:rls:check`: both pass
  — no RLS policy changes in this workstream (the admin path
  deliberately bypasses RLS via the service-role key rather than
  changing any policy, so the existing per-user isolation guarantees
  for every other access path are completely unaffected).
- **Live browser verification** (via `curl`, dev server): confirmed
  `/admin` returns 404 for an anonymous visitor — the first, cheapest
  gate to verify. The full admin-authenticated data-rendering path was
  not live-verified (no admin test account/service-role key available
  in this environment) — verified by code inspection only, same
  documented limitation as WS21's signed-in path.

## Risk / correctness notes — read this before configuring the key

- The service-role key is the single highest-privilege credential this
  project has introduced. If it were ever accidentally exposed
  client-side, it would allow full read/write access to every table in
  the production database, bypassing all RLS. The `"server-only"`
  import in `adminClient.ts` throws at build/bundle time if this file
  is ever imported into client-bundled code — a real backstop, verified
  by this project's existing build tooling — but the primary safety
  property is architectural: the function is never called except from
  one server component, after two independent auth checks.
- When configuring `SUPABASE_SERVICE_ROLE_KEY` in Vercel, it must be
  added WITHOUT a `NEXT_PUBLIC_` prefix (which would bundle it into
  client-side JavaScript) — this is the standard Supabase/Next.js
  convention already followed correctly by every other env var in this
  project, but is worth stating explicitly given the stakes here.
- `ADMIN_EMAILS` should be set to the fewest possible real email
  addresses — every listed address gets full read access to every
  user's entitlement tier and feedback submissions.

## Database changes

None — this workstream adds no migration. It reads the already-applied
`user_entitlements` table (migration 040/041) and the not-yet-applied
`user_feedback` table (migration 044, from WS21 this same session).
