# Sprint 13 — Release Readiness

## Definition of Done — checked against live evidence, not narrative claims

| Criterion | Status | Evidence |
|---|---|---|
| Coherent private-beta product exists | ✅ | Unified nav (WS2), one search component reused across 3 surfaces (WS3) |
| Search works across supported jurisdictions | ✅ | Live-verified (Phase 1/2 browser tests), bounded, tested |
| Real suburb and postcode profiles work | ✅ | Pre-existing + WS4 explainability additions, live-verified |
| Comparison works across states | ✅ | Reorder + shareable URL live-verified, print CSS tuned |
| Property analysis and Scenario Lab work | ✅ | WS5 (trimmed) + WS6 (multi-case), live-verified, report export |
| Saved research is properly user-isolated | ✅ | Static RLS on all 10 tables, verified against live production DB |
| Confidence, freshness and lineage are visible | ✅ | Glossary + lineage on 5 new placements, "never zero" enforced |
| Internal operations/freshness monitoring exists | ✅ | WS12 extension, real gaps closed (period/timestamp columns) |
| Exports contain real generated content | ✅ | Live-verified: real CSV downloaded and inspected from a running page |
| Security and RLS tests pass | ✅ | 297/297 tests, `warehouse:rls:check` passes, live production advisor check clean |
| CI passes on the final commit | ✅ | Verified below |
| Preview deployment browser-tested, or blocker documented | ⚠️ | Deployed successfully (Ready, target=preview); SSO-gated, so full external browser test needs your own authenticated session — documented exact URL and steps |
| Production remains untouched (code/deploy) | ✅ | No merge to main, no `vercel deploy --prod` ever run |
| No paid infrastructure added | ✅ | Confirmed no purchases, no new paid services |
| No raw data or credentials committed | ✅ | Scanned clean throughout |
| Final reports accurately describe live evidence | ✅ | This document + WS21's independent DB verification |

## One item requiring judgement, not just a checkbox

Workstream 21 found that Sprint 13's new database tables had never
actually been applied anywhere live (not production, not any branch) —
a real gap between "the migration file is correct" and "the feature
works." **With your explicit approval**, I applied all 4 migrations to
production this pass (additive-only, independently verified before and
after, zero new security lint issues). This is documented prominently
rather than buried, since it's the one action this sprint that touched
production, and it happened only because you explicitly approved it in
the moment it was needed.

## CI status on the final pushed commit

See `sprint13_checkpoint.md` for the exact commit hash and `gh run list`
output — green on every checkpoint through this one.

## Recommendation

Ready for the private-beta operating pack's Go/No-Go checklist
(`sprint13_operating_pack.md`) to be worked through by a human before
any real user is invited — specifically the entitlement-tier decision
and the `DATA_OPERATIONS_ENABLED` decision for real beta users (currently
on for testing convenience, recommend off for actual beta users since
it's an internal console).
