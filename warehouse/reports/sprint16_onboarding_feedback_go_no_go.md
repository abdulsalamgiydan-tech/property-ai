# Sprint 16 Onboarding And Feedback GO/NO-GO

Date: 2026-07-25
Scope: Production activation assessment for onboarding preferences and user feedback.

## Current Reachability

Onboarding and feedback are already present in the core Production application code deployed at commit `71d93c54a2dad8d2952ab6d7355efa3b5a6f16a0`.

- `/onboarding` exists in the app.
- Post-auth completion checks `user_onboarding_preferences` and redirects first-time users to onboarding when no row exists.
- The feedback widget is globally mounted from `app/layout.tsx`.
- The feedback widget renders only for a signed-in user.

No Production environment variable change is required for these surfaces to exist in the current core app.

## Schema And RLS Compatibility

Production migration ledger ends at `044_user_feedback`.

| Table | Purpose | Rows | RLS |
| --- | --- | ---: | --- |
| `user_onboarding_preferences` | One row per user for optional onboarding preferences | 0 | enabled |
| `user_feedback` | Signed-in user feedback submissions | 0 | enabled |

Policy assessment:

- `user_onboarding_preferences`: select, insert, update, and delete are owner-scoped to `auth.uid() = user_id`.
- `user_feedback`: select-own and insert-own only. No update/delete policy, making submitted feedback immutable by ordinary users.

## Application Behavior

Onboarding:

- Optional and skippable.
- Save path uses ordinary browser Supabase client and authenticated user context.
- Save failure does not block navigation, avoiding an onboarding redirect trap.
- Uses an upsert keyed by `user_id`, so duplicate preference submissions update the user's row.
- `getOnboardingStatus()` fails open if the table is unavailable, preserving application access.

Feedback:

- Requires signed-in user.
- Rejects empty sanitized messages client-side/helper-side.
- Uses ordinary browser Supabase client and authenticated user context.
- Sanitizes free-text feedback before insert.
- Limits message field to 500 characters in the UI.
- Does not require service-role credentials.

## Risks And Gaps

- Authenticated Production UAT has not yet been run with an approved Production account.
- Feedback deletion by the submitting user is intentionally not available; any cleanup of submitted feedback would require an approved admin/operational process, not a normal browser user.
- Admin review of feedback remains disabled because `ADMIN_EMAILS` is absent.
- Current tables are empty, so live persistence still needs a human-guided Production UAT run before declaring end-to-end Production pass.

## Decision

- Onboarding activation: CONDITIONAL GO.
- Feedback activation: CONDITIONAL GO.

Conditions:

- Complete human-guided authenticated Production UAT with an approved account.
- Confirm any temporary onboarding preference or feedback record is either acceptable to retain as a real user-owned record or is cleaned up through an approved operational path.
- Keep Admin disabled unless separately approved.
