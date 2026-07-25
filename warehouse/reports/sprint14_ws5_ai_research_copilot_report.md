# Sprint 14 — Workstream 5: Grounded AI Research Copilot

## Scope delivered this pass

A question-answering feature scoped to the brief's explicit constraint:
build the deterministic evidence/retrieval layer first, and use only an
already-configured provider — never activate a new paid one.

**No new provider was activated.** This project already has a
production-configured `ANTHROPIC_API_KEY` (used by the existing
`/strategy` generator, `lib/strategy/claudeClient.ts`). The copilot
reuses the exact same raw-fetch Anthropic Messages API pattern
(`lib/research/copilotClient.ts`) — same env var, same model, same
error handling shape. No new environment variable for a provider key
was added; the only new env var is a feature flag
(`RESEARCH_COPILOT_ENABLED`), off by default.

### The deterministic layer (built first, as required)

1. **`lib/research/copilotEvidence.ts`** — `buildEvidencePack()` turns a
   market snapshot into a fixed, labelled list of facts (median sale
   price, weekly rent, gross yield, dwelling stock, approvals,
   population, household income, price-to-income ratio), each with its
   confidence label and source period when one exists. A missing metric
   renders as literally "Not recorded", never omitted or silently
   zeroed. Pure, no network call, no LLM dependency. 8 tests.
2. **`lib/research/copilotGrounding.ts`** — `checkAnswerGrounding()` is
   the safety net: it extracts every dollar figure and percentage the
   model's answer states and confirms each one appears in the evidence
   pack it was given. This is deterministic code, not a second prompt —
   the model's own claim to have "only used the evidence" is never
   trusted on its own. Documented as a heuristic, not a proof: it can
   catch a fabricated *number* but not a fabricated *qualitative* claim
   (e.g. an invented trend with no attached figure) — stated honestly
   in the module's own comment, not overclaimed. 10 tests. One real bug
   caught by the test suite: the initial money regex swallowed a
   trailing sentence comma (`$850,000,` instead of `$850,000`); fixed
   before this report was written.

### The LLM layer

3. **`lib/research/copilotClient.ts`** (server-only) — calls the
   Anthropic Messages API with a system prompt that: (a) restricts the
   model to the supplied evidence text only, (b) forbids stating any
   number not in that evidence, (c) forbids any forecast or prediction
   about future prices/rents/growth, (d) forbids financial/tax/legal/
   investment advice or recommendations, (e) caps the answer to 3
   sentences. `max_tokens` capped at 500 to bound per-call cost. No test
   file (matches the existing precedent: `lib/strategy/claudeClient.ts`
   also has none — real network calls to a paid API are not exercised
   in the unit test suite).

### The route and safety gating

4. **`app/api/research/copilot/route.ts`** — auth required; evidence is
   **always re-fetched server-side from `geographyCode`**, never
   accepted from the request body. This is the load-bearing security
   property: if a client could supply its own "evidence", the grounding
   check would be trivially bypassable (a caller could claim any number
   is "verified evidence"). Tested explicitly: a request with a
   spoofed `evidence` field in the body is ignored entirely.
   - Gated behind two feature flags: `WAREHOUSE_PREVIEW_ENABLED` (the
     existing app-wide research gate) and the new
     `RESEARCH_COPILOT_ENABLED` (specific to this feature, off by
     default — see "Production readiness" below).
   - Two layers of rate limiting: an in-memory per-instance limiter
     (3 requests/minute/user, `lib/security/rateLimiter.ts`, the same
     best-effort mechanism already used by
     `/api/watchlist/refresh-changes`) as an immediate defense, plus a
     DB-backed daily limit (5 questions/24h/user,
     `lib/research/copilotRateLimit.ts`) for real cross-instance
     enforcement.
   - Every ungrounded answer is still returned to the user (not
     silently blocked) but flagged: `grounded: false` plus the specific
     ungrounded claims, so the UI can show a visible caution banner
     instead of hiding a possibly-wrong number.
5. **`app/api/research/copilot/route.test.ts`** — 11 tests: flag-gating
   (both flags independently), auth requirement, input validation,
   unknown-geography handling, the client-supplied-evidence-is-ignored
   security property, ungrounded-answer flagging, daily-limit 429,
   graceful behaviour when the rate-limit table doesn't exist yet
   (treated as "allow through", not a crash), LLM-failure handling
   without leaking the raw provider error to the client, and the
   per-instance rate limit itself.

### UI

6. **`components/research/ResearchCopilotClient.tsx`** — a question box
   on a new page; renders the answer, an amber caution banner when
   `grounded: false`, and the full evidence list used (with confidence/
   source-period annotations) so a user can see exactly what the answer
   was — and wasn't — allowed to draw on.
7. **`app/research/copilot/[geographyCode]/page.tsx`** — new route,
   gated by both flags (mirrors the existing `/research/scenario`
   page's pattern exactly). Linked from the suburb research profile
   (`MarketSnapshotView.tsx`) the same way the Scenario Lab link
   already works, via a new `researchCopilotEnabled` prop threaded from
   `isResearchCopilotEnabled()`.

## Production readiness — deliberately NOT live yet

This feature is off in production today and will remain off until
explicitly turned on, by design:

1. **`RESEARCH_COPILOT_ENABLED`** is unset in production — the route
   returns 404 and the page 404s, with zero behavioural change to any
   existing surface.
2. **`supabase/migrations/042_research_copilot_queries.sql`** (new) —
   an additive table (`research_copilot_queries`, mirroring the
   existing `strategy_generations` shape) backing the daily rate limit
   and providing an audit trail. **Written and statically verified this
   pass (6 tests, plus `warehouse:rls:check` now covers the new table)
   but NOT applied to production** — per this project's standing
   guardrail, any production database change requires explicit
   approval, exactly like migration 041 earlier this sprint. The route
   degrades gracefully if this migration isn't applied yet (a missing-
   table error is caught and treated as "rate limiting unavailable,
   allow through" rather than a 500), but real cross-instance rate
   limiting will not function until it is.

Turning this feature on requires two separate, explicit actions: set
`RESEARCH_COPILOT_ENABLED=true` in the relevant Vercel environment, and
apply migration 042 to production. Neither was done in this pass —
flagged here for an explicit decision, not silently assumed.

## What was deliberately not done

- No conversation memory / multi-turn chat — every question is answered
  independently from a freshly-built evidence pack, deliberately
  avoiding the larger surface (and cost/abuse risk) of a chat loop.
- No coverage beyond the suburb-level market snapshot fields already
  used elsewhere (Scenario Lab, report builder) — no new warehouse
  query or metric family was added for this workstream.
- The grounding check is numeric-only (documented limitation above) —
  a fabricated qualitative claim with no attached figure would not be
  caught. Mitigated by the system prompt's explicit no-forecast/no-
  speculation instruction, but not independently verified by code.
- No postcode-level copilot page — scoped to suburb (`SAL`) geography
  only, matching the Scenario Lab's existing scope.

## Testing

- New tests this workstream: 8 (`copilotEvidence`) + 10
  (`copilotGrounding`) + 3 (`env.ts` flag) + 6 (migration 042 static
  checks) + 11 (API route) + 1 (analytics event contract) = 39.
- Full suite: 389/389 passing (up from 350 at the last checkpoint).
- `npx eslint` across every new/modified file: clean.
- `npm run build`: passes; both new routes (`/api/research/copilot`,
  `/research/copilot/[geographyCode]`) confirmed present in the build
  output.
- `npm run warehouse:check` / `npm run warehouse:rls:check`: both pass;
  the RLS checker now covers `research_copilot_queries` (documented
  exception, same shape as `strategy_generations`: append-only,
  select+insert only, no update/delete surface).

## Risk / correctness notes

- The single highest-value correctness property in this workstream is
  that evidence is server-fetched from `geographyCode`, never client-
  supplied — verified by an explicit test that a spoofed `evidence`
  field in the request body is ignored entirely and never appears in
  the response.
- `sanitiseUserText()` (existing, from the `/strategy` feature) is
  reused unchanged for the question text — no new prompt-injection
  defence logic was written; the existing one was judged sufficient
  for a short, single-turn question.
- `console.error` on LLM failure logs the error server-side but the
  client response body is verified (by test) to never contain the raw
  provider error message, including not leaking whether
  `ANTHROPIC_API_KEY` is the specific problem.
