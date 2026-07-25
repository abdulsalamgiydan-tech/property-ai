# Sprint 14 — Workstream 2: Onboarding

## Scope delivered this pass

A short, always-skippable, one-time onboarding step shown right after a
user's first sign-in, per the brief's "new UI surface, RLS-backed
preferences, genuinely useful but not blocking" framing.

1. **`supabase/migrations/043_onboarding_preferences.sql`** (new) —
   `user_onboarding_preferences` table (one row per user: `primary_goal`,
   `states_of_interest text[]`, timestamps), standard RLS (all four
   `auth.uid() = user_id` policies — select/insert/update/delete, no
   `KNOWN_EXCEPTIONS` entry needed since it follows the standard shape
   used elsewhere). Additive only. **Not applied to production** in
   this pass, same explicit-approval guardrail as migrations 041/042
   earlier this sprint — 6 static tests + `warehouse:rls:check`
   coverage.
2. **`lib/supabase/onboardingPreferences.ts`** — `getOnboardingStatus()`
   / `saveOnboardingPreferences()`. `getOnboardingStatus()` **fails
   open**: if the table doesn't exist yet (migration not applied), if
   Supabase isn't configured, or on any other error, it reports
   `completed: true`. This is deliberate — a status-check failure must
   never trap a user in a redirect loop into a step whose result can't
   be saved either.
3. **`app/onboarding/page.tsx` + `components/onboarding/OnboardingClient.tsx`**
   — two questions ("What brings you here?" — investor / first-home-
   buyer / just researching; "Which states are you interested in?" —
   multi-select chips from the existing `AU_STATES` constant), both
   fully optional. "Continue" saves and proceeds; "Skip for now" is
   equally prominent and always available. Neither choice gates access
   to anything — every field is a personalisation hint, never a
   requirement.
4. **`app/auth/complete/page.tsx`** (modified) — after a user is
   confirmed signed in, the page now checks `getOnboardingStatus()`
   before its existing auto-redirect timer fires. If onboarding isn't
   complete, it redirects to `/onboarding?next=<original nextPath>`
   instead of the original destination directly; otherwise behaviour is
   unchanged from before this workstream. The existing
   auth-error/session-timeout paths are untouched and run before the
   onboarding check could ever affect them.

## A real bug found and fixed during live verification

Before committing, I started the dev server and used the `browse` tool
to actually click through the onboarding page end to end (heading
renders, all three goal buttons + all eight state chips render and
toggle `aria-pressed` correctly on click, both action buttons present).
Clicking "Skip for now" with no `next` query param (i.e. navigating to
`/onboarding` directly, outside the normal auth-redirect flow) sent the
user to `/` instead of `/dashboard`. Root cause:
`safeInternalNextPath(null)` returns `"/"` (a non-empty, truthy string)
as its own safe default, so `safeInternalNextPath(nextPathRaw) ||
"/dashboard"` never fell through to the `/dashboard` fallback — `"/"`
is truthy. Fixed to explicitly check for `"/"` the same way
`app/auth/complete/page.tsx`'s own `nextPath` memo already does:
`!safeNextPath || safeNextPath === "/" ? "/dashboard" : safeNextPath`.
Re-verified live after the fix: "Skip for now" now correctly lands on
`/dashboard`. In the real product flow (reached via `/auth/complete`)
this bug was unreachable, since that page always supplies a concrete
`next` value — but it's a real bug in the component's own standalone
default and is fixed regardless.

## What was deliberately not done

- No forced/blocking onboarding — a returning user who skips is never
  asked again by anything in this codebase (there is no "nag" re-check
  anywhere outside the one-time redirect from `/auth/complete`).
- The collected preferences (`primary_goal`, `states_of_interest`) are
  not yet read anywhere else in the app — no personalised defaults
  (e.g. pre-filtering `/research/explore` by state, or tailoring
  Dashboard copy by goal) were wired up this pass. That's the natural
  next step once this ships, not attempted here to keep the workstream
  bounded.
- No admin visibility into onboarding completion rates — that would be
  a Tier 4 ops-console item, not this workstream's scope.

## Testing

- `supabase/migrations/043_onboarding_preferences.test.ts` (new): 6
  static tests — additive-only DDL, RLS enabled, all four standard
  policies present, no `SECURITY DEFINER`, and the migration's own
  header states explicitly that it isn't applied to production yet.
- `warehouse/scripts/quality/check_rls_policies.test.ts`: added
  `user_onboarding_preferences` to the real-migration-corpus coverage
  list (no exception needed — standard shape).
- Full suite: 396/396 passing (up from 389 after WS5).
- `npx eslint` across every new/modified file: clean.
- `npm run build`: passes; `/onboarding` route present in the build
  output.
- `npm run warehouse:check` / `npm run warehouse:rls:check`: both pass.
- **Live browser verification** (via the `browse` tool, dev server):
  page loads, heading renders, all 3 goal buttons and 8 state chips
  render and correctly toggle selected state on click, both action
  buttons present, "Skip for now" navigates away — this caught and led
  to fixing the redirect-default bug described above.

## Database changes

`supabase/migrations/043_onboarding_preferences.sql` is written,
statically verified, and RLS-checker-covered, but **not applied to
production** in this pass — requires the same explicit approval as
every other production database change in this project. Until applied,
`getOnboardingStatus()` fails open (reports "completed") so the
onboarding step simply never appears rather than erroring — no user-
facing regression from the migration being unapplied.

## Risk / correctness notes

- The onboarding save call (`saveOnboardingPreferences`) is
  fire-and-forget from the user's perspective: `handleContinue()`
  always calls `router.replace(nextPath)` after attempting the save,
  regardless of whether the save succeeded — consistent with "never
  block access to the product over a personalisation nicety."
- `safeInternalNextPath` (existing, unchanged) is reused for the
  onboarding redirect target, so the same open-redirect protection
  already relied on by `/auth/complete` applies here too.
