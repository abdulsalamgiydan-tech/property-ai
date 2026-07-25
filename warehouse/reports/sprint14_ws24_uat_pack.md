# Sprint 14 — Workstream 24: UAT Pack

Structured test scenarios for a human tester with a real signed-in
account — this session verified everything reachable without one
(anonymous pages, build/lint/tests, static gating logic), but several
signed-in paths this sprint were verified by code inspection only, not
live end-to-end, for lack of a test account in this environment. Those
are marked **[NOT LIVE-VERIFIED]** below and should be prioritized.

## Prerequisites

- `WAREHOUSE_PREVIEW_ENABLED=true`, `SCENARIO_LAB_ENABLED=true`,
  `MULTI_STATE_RESEARCH_ENABLED=true` (already the local dev default,
  per `.env.local`).
- A real Supabase auth account to sign in with.
- To test WS5 (research copilot): `RESEARCH_COPILOT_ENABLED=true` and
  migration 042 applied (otherwise the route/page 404, as designed).
- To test WS20 (admin): `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_EMAILS`
  (containing your test account's email) both set.

## Tier 1/2 features (built earlier this sprint — spot-check, not full re-test)

1. Sign up / sign in works end to end (`/`, "Sign in / Get started" →
   `/auth/complete` → lands on `/dashboard`).
2. `/analyse-property`: fill the form, click Analyse, confirm results
   render, confirm the new **Stress test** tab (WS6) shows a table with
   6 rows (current + 3 rate shocks + vacancy + combined) and after-tax
   cashflow colour-codes red/green correctly.
3. `/research/scenario/[a-real-suburb-code]`: confirm the new **Extra
   repayments** slider (WS7) changes the debt/equity path table and
   shows the "+$X extra equity" line when set above 0.
4. `/watchlist` **[NOT LIVE-VERIFIED]**: add a geography-linked item,
   click "Check now" — confirm the "What changed?" panel updates,
   confirm the digest preference select and "Preview digest" toggle
   work, confirm no email/push is ever actually sent (there shouldn't
   be — check your inbox to confirm nothing arrived).
5. `/analyse-property` results → "Download report (CSV/JSON)" (WS11):
   confirm the downloaded file includes a Property Analysis section.

## Tier 3/4 features (this session — prioritize these)

6. `/onboarding` **[NOT LIVE-VERIFIED end-to-end with a fresh account]**:
   sign in with a brand-new account, confirm you land on `/onboarding`
   before `/dashboard` (requires migration 043 applied — otherwise it's
   correctly skipped, not a bug). Click a goal, click a few state
   chips, confirm the ✓ checkmark appears (WS18 fix). Click "Continue"
   — confirm you land on `/dashboard`, not `/`. Sign in again with the
   same account later — confirm you do NOT see `/onboarding` again.
7. `/research/copilot/[a-suburb-with-data]` **[NOT LIVE-VERIFIED]**
   (requires the flag + migration 042 applied): ask a real question
   ("What is the median sale price?"). Confirm the answer only cites
   figures shown in the "Evidence used" list below it. Try to trick it
   ("What will prices be in 2030?") — confirm it declines to speculate
   rather than inventing a number. Submit 6 questions within a few
   minutes — confirm the 6th is rejected with a rate-limit message.
8. Feedback widget **[NOT LIVE-VERIFIED]**: while signed in, confirm
   the floating "Feedback" button appears bottom-right (not for signed-
   out visitors — check in an incognito window). Submit feedback,
   confirm the "Thanks" message appears. Requires migration 044 applied
   to actually persist — otherwise expect a friendly error, not a
   crash.
9. `/admin` **[NOT LIVE-VERIFIED]** (requires both env vars set, your
   account's email in `ADMIN_EMAILS`): confirm you can see it; confirm
   a second, non-admin account gets a 404, not an error page. Confirm
   the entitlements and feedback lists show real data across *all*
   users, not just your own.
10. `/legal`: confirm it's reachable from the footer link on any page,
    confirm the "About your data" section reads accurately against
    whatever is actually deployed at test time.
11. `/research/explore`: confirm the "Has market data first" / "Name
    (A-Z)" sort control changes result order; search a nonsense term
    with a state filter active, confirm "Clear all filters" resets the
    URL.

## Regression check (things that existed before this sprint, touched incidentally)

12. `/research/suburb/[code]` and `/research/postcode/[code]`: confirm
    both still render correctly (WS19 added a tracking component and
    WS20 added a `geographyCode` prop to the postcode page that didn't
    exist before — low risk, but worth a glance).
13. Open browser devtools console on any page — confirm no new JS
    errors appear (one pre-existing, harmless dev-mode CSP/eval notice
    is expected and documented — see the WS21 report).

## Out of scope for this UAT pack

Payment/billing flows (schema-only, no activation this sprint or
before), any Tier 4 item not reached this sprint (WS13/14/15 — see the
final audit for what those are and why they weren't attempted).
