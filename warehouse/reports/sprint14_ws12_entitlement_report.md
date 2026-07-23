# Sprint 14 Workstream 12 — Subscription and Entitlement Enforcement

## Real bug found and fixed in the existing entitlement matrix

`lib/auth/entitlements.ts` (Sprint 13) listed `saved_scenarios` as a
`"research"`-tier-minimum feature — but the actual live Scenario Lab
save feature (also Sprint 13) has always been available to every
signed-in user, unconditionally. This line was aspirational, never
enforced, and directly contradicted live behaviour. Corrected to
`"free"` — this is the kind of "correct a prior report against live
evidence" finding the project's own audit discipline exists to catch.

## Enforcement mechanism chosen: volume caps, not on/off gates

Per the guardrail "every existing feature stays available at free tier
by default — no regression for current users," gating Scenario Lab save
entirely behind a paid tier was never on the table. Instead: a real,
generous numeric cap per tier (free=10, research=25, investor_pro=100,
professional=unlimited saved scenarios), enforced as an actual limit a
free-tier private-beta user is unlikely to hit today, while
demonstrating genuine tier-aware server-side enforcement.

## Where the enforcement actually lives: a database trigger, not just app code

New migration `041_scenario_lab_case_limits.sql` adds a `BEFORE INSERT`
trigger on `scenario_lab_cases` that looks up the inserting user's tier
(defaulting to `free` if no `user_entitlements` row exists — same
default-decided-in-one-place rule as `getUserTier()`), counts their
existing saved scenarios, and raises a custom exception if they're at
or over their tier's limit.

**Why a trigger, not just an API-route check**: an API-route-only check
can be bypassed by any client that calls Supabase directly with the
anon key (which any authenticated user technically can, using their own
script) — the *only* thing that's genuinely unbypassable is enforcement
at the database level, which is what "cannot be bypassed through direct
API calls" actually requires. `lib/auth/entitlements.ts`'s new
`FEATURE_LIMITS`/`getFeatureLimit()`/`hasReachedLimit()` exist purely as
a UI-side prediction layer (to show "you're at your limit" before a
save attempt) — the trigger is the real, single source of truth, and a
test (`041_scenario_lab_case_limits.test.ts`) guards against the two
drifting apart.

**Why a new trigger instead of rewriting the existing insert policy**:
the existing `scenario_lab_cases` insert RLS policy (migration 037) is
already correct and tested. Rewriting its `WITH CHECK` clause to add
the count logic would risk breaking working inserts if the new subquery
had a bug. A separate, additive trigger can be fixed or dropped in
isolation without touching the proven policy at all.

**No `SECURITY DEFINER`**: the inserting user already has RLS `SELECT`
access to their own `user_entitlements` row and their own
`scenario_lab_cases` rows, so the trigger runs as the invoking user
(Postgres default) — deliberately avoiding the exact "SECURITY DEFINER
function callable by anon/authenticated" class of issue Sprint 13's
security advisor scan already flagged elsewhere in this project. Tested
explicitly (`041_scenario_lab_case_limits.test.ts`).

## Client-side UX

`ScenarioLabClientV2.tsx`'s save button now recognises the trigger's
custom exception message (`isScenarioLabLimitExceededError()`) and
shows "Saved scenario limit reached — delete an old one, or upgrade for
more" instead of a raw Postgres error or a generic "Save failed."

## What was NOT done this pass (explicitly deferred)

- No proactive usage counter (e.g. "8/10 saved") shown before a user
  hits the limit — would require extending `/api/account/entitlements`
  to also return current counts, real but separable UI-polish work.
- No admin UI to manually grant a tier — the existing `service_role`-only
  write path on `user_entitlements` (Sprint 13) is the correct
  mechanism; a human grants a tier via the Supabase dashboard directly
  today. A dedicated admin UI is Sprint 14 WS20's scope (Tier 4).
- Only `scenario_lab_cases` got a real enforced limit this pass —
  watchlist/comparison/portfolio limits from the brief's entitlement
  matrix are designed in `FEATURE_MIN_TIER` but not yet enforced;
  flagged as remaining scope rather than silently implied done.

## Validation

`npm run lint` (0 errors), `npm run build`, `npm run test`
(**325/325**, +14 from this workstream), `npm run warehouse:check`,
`npm run warehouse:rls:check` — all pass. Migration 041 is additive
only (verified: no `DROP`/`TRUNCATE`/`DELETE`, asserted by its own test).

## Production migration — requires your explicit approval before I apply it

Migration 041 has NOT been applied to production yet. Per this
project's established pattern (Sprint 13 WS21), applying it requires
your explicit approval, since Production is the only live instance of
the main-app schema `scenario_lab_cases` belongs to (no safe non-prod
branch exists for this schema, documented since Sprint 13 WS8).
