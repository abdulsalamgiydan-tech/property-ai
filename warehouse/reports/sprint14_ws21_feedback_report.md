# Sprint 14 — Workstream 21: In-App Feedback

## Scope delivered this pass

No feedback mechanism existed anywhere in the app before this
workstream — confirmed by searching the codebase for any prior art.
Built a small, always-reachable feedback widget for signed-in users.

1. **`supabase/migrations/044_user_feedback.sql`** (new) —
   `user_feedback` table (`id`, `user_id`, `category`, `message`,
   `page_path`, `created_at`). Append-only, same shape as
   `strategy_generations`/`research_copilot_queries`: select-own and
   insert-own RLS only, no update/delete surface — feedback is meant to
   be an honest, unaltered record. **Not applied to production** in
   this pass, same explicit-approval guardrail as every other migration
   this sprint. 6 static tests + added to the RLS checker's known
   exceptions (`user_feedback`, matching the append-only reasoning
   already used for the other two log-shaped tables).
2. **`lib/supabase/feedback.ts`** — `submitFeedback()`. Reuses
   `sanitiseUserText()` (already used for `/strategy` inputs and the
   research copilot's question text) on the free-text message —
   general hygiene against storing/later-displaying unescaped
   HTML/script content, not just LLM-prompt-specific, so reusing it
   here is a legitimate DRY choice rather than a mismatched pattern.
3. **`components/feedback/FeedbackWidget.tsx`** (new) — a fixed-position
   floating "Feedback" button, expanding into a small panel (category
   select: bug / idea / other, a message textarea, send button).
   **Only renders for a signed-in user** (`if (!user) return null`),
   matching every other write-feature in this app requiring an
   account. Positioned at `bottom-[8.5rem] right-3` on mobile (clearing
   the existing floating account/sign-out buttons at
   `bottom-[5.1rem]`) and `bottom-6 right-6` on desktop.
4. **`app/layout.tsx`** — wired the widget in globally, inside
   `<Providers>` (needs `useAuth()` context) alongside the existing
   `<Navbar>`/`<main>`. Deliberately NOT added as a `Navbar` link — the
   nav's desktop/mobile link arrays are already dense; a persistent
   floating entry point is more discoverable and doesn't compete for
   nav real estate.
5. **`lib/analytics/events.ts`** — added a proper `feedback_submitted`
   event (category only, no message content — message text is
   free-form user input and deliberately never logged to analytics,
   consistent with this file's own "never logs raw form input"
   guardrail comment).

## Testing

- `supabase/migrations/044_user_feedback.test.ts` (new): 6 tests —
  additive-only DDL, RLS enabled, exactly select+insert policies (no
  update/delete), no `SECURITY DEFINER`, header states explicitly not
  applied to production yet.
- `warehouse/scripts/quality/check_rls_policies.test.ts`: added
  `user_feedback` to both the known-exceptions config and the
  real-migration-corpus coverage list.
- `lib/analytics/events.test.ts`: extended to cover the new
  `feedback_submitted` shape.
- Full suite: 408/408 passing (up from 401 after WS22).
- `npx eslint`: clean (caught and fixed one real issue — an
  unescaped apostrophe in JSX, `react/no-unescaped-entities`).
- `npm run build`: passes.
- `npm run warehouse:check` / `npm run warehouse:rls:check`: both pass.
- **Live browser verification** (via the `browse` tool, dev server):
  confirmed the home page renders with no new console errors and the
  feedback widget correctly does NOT appear for an anonymous visitor
  (the only console message present was a pre-existing, unrelated
  dev-mode CSP/eval notice from WS16's security headers work, harmless
  and explicitly React-dev-mode-only per its own text). The signed-in
  rendering path was verified by code inspection only — no test
  account was available in this environment to exercise it live; the
  component's gating logic (`if (!user) return null`) is a single,
  simple, directly-readable conditional.

## What was deliberately not done

- No admin-facing view of submitted feedback yet — that's naturally
  paired with WS20 (beta admin), not built in this pass. Feedback rows
  are currently only readable by the submitting user (via the select-
  own RLS policy) and via direct Supabase dashboard access by a human
  admin, same pattern as every other admin-adjacent gap this sprint.
- No feedback categorisation/triage workflow, no email notification on
  new feedback, no rating/NPS-style widget — kept to the smallest
  useful shape (free text + one category) for a private beta.
- Feedback is not sent anywhere outside this app's own database — no
  Slack webhook, no third-party feedback tool integrated.

## Database changes

`supabase/migrations/044_user_feedback.sql` is written, statically
verified, and RLS-checker-covered, but **not applied to production** in
this pass — requires the same explicit approval as migrations
041/042/043. Until applied, `submitFeedback()` will surface Postgres's
own "relation does not exist" error message as a friendly failure (not
a crash) rather than succeeding — acceptable for a low-traffic, non-
critical feature, and consistent with how this sprint's other
not-yet-applied migrations (042, 043) were handled, except this one
does not implement the "fail open" pattern those did, since there is
no safe default for a feedback *submission* to fail open to (unlike a
read-only status check).

## Risk / correctness notes

- The widget's `page_path` field (captured via `usePathname()`) gives
  basic context on where feedback was submitted from without any
  additional tracking infrastructure.
- `sanitiseUserText()`'s 500-character cap and HTML-stripping apply
  here exactly as they do for `/strategy` and the research copilot —
  no new sanitisation logic was written, reducing the chance of a
  fresh sanitisation bug.
