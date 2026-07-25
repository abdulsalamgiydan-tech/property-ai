# Sprint 14 — Execution Plan

## Reality check on scope

The Sprint 14 brief specifies 26 workstreams (0-25), several of which
(WS5 AI copilot, WS12 subscription entitlement, WS13 refresh engine v4,
WS16 security, WS23 release engineering) are individually comparable in
scope to an entire Sprint 13 phase. Sprint 13 — a smaller brief — took a
full extended session across two phases to deliver 21 workstreams
genuinely (tested, verified, not just scaffolded). Attempting all 26
Sprint 14 workstreams to the same bar in one continuous autonomous run
is not realistic, and the brief's own completion criteria ("prove the
system works," not "files were created") explicitly reject shallow
coverage as a substitute.

**Approach**: work through workstreams in priority order, each to a
genuinely complete, tested, verified state, and checkpoint honestly when
approaching the context budget — exactly as the brief's own token
management section requires — rather than thinly touching all 26.

## Priority order and rationale

Grouped by dependency and value, not strictly by the brief's numbering:

**Tier 1 — foundational, unlocks everything else**
- WS0 (this) — baseline ✅
- WS16 (security review) — do early since every subsequent workstream
  should be built on a known-clean security baseline, and several later
  workstreams (WS12 entitlements, WS5 AI copilot) have security
  implications that are cheaper to get right from the start than retrofit.
- WS12 (subscription/entitlement enforcement) — Sprint 13 built the
  schema; Sprint 14's brief explicitly asks to *enforce* it server-side.
  This is a bounded, well-specified unit of work with a clear existing
  foundation (`lib/auth/entitlements.ts`).

**Tier 2 — highest customer-facing value, extends existing strong foundations**
- WS9 (watchlist/change intelligence v2) — Sprint 13 built the
  detection engine; this extends thresholds/noise-suppression/read-state,
  a natural continuation with low risk.
- WS6 (property analysis v2) — extends the existing, mature
  `AnalysePropertyClient` rather than building new; high leverage.
- WS7 (Scenario Lab v2 extensions) — Sprint 13 already built multi-case
  Scenario Lab; this adds more scenario types and sensitivity tables on
  a proven foundation.
- WS11 (report builder) — Sprint 13 built one report export path
  (Scenario Lab); this generalizes it into a real report builder.

**Tier 3 — new, higher-risk/higher-effort surfaces**
- WS5 (AI research copilot) — explicitly told to build the deterministic
  evidence/retrieval layer first and only use an already-configured
  provider, never activate a new paid one. Real, bounded scope if kept
  to that instruction.
- WS2 (onboarding) — new UI surface, RLS-backed preferences, genuinely
  useful but not blocking other work.
- WS3/WS4 (discovery v2 / area intelligence v2) — largely incremental UI
  polish over Sprint 9-13's already-substantial research platform;
  lower priority than genuinely new capability.

**Tier 4 — operational maturity (do if time remains, otherwise document as remaining)**
- WS13 (refresh engine v4), WS14 (data-quality monitoring), WS15 (ops
  console v2), WS17 (performance), WS18 (accessibility), WS19
  (analytics), WS20 (beta admin), WS21 (feedback), WS22 (legal copy).

**Always at the end**
- WS23 (release engineering), WS24 (UAT pack), WS25 (final independent
  audit) — these depend on whatever was actually built, so they're
  written last and must reflect real state, not the original brief's
  aspirational list.

## What will NOT be attempted this pass, stated up front rather than discovered late

Given the tier structure above, Tier 4 items are unlikely to all be
reached in genuine depth. This will be stated honestly in the final
report rather than papered over — consistent with Sprint 13's own
practice of correcting prior claims against live evidence.

## Sequencing discipline (same as Sprint 13)

For every workstream: inspect → define acceptance criteria → implement
the smallest coherent slice → test → run the full validation suite
(lint/build/test/warehouse checks) → commit → push → confirm CI → only
then move on. No workstream is marked complete without genuine
verification, matching this sprint's own instruction not to trust a
script's own success message.
