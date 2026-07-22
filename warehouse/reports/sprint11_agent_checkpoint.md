# Sprint 11 Agent Checkpoint

**Sprint**: Australian Residential Property Intelligence V3 (National
Coverage, Historical Harmonisation, Research Indicators, Automated
Operations and Production Candidate)

**Checkpoint written**: 2026-07-22 ~10:40 Australia/Sydney (supersedes the
previous update, written after WS9 sub-pass 1 — this file now reflects
WS9 sub-pass 2 and Workstreams 10-13, all complete, per the user's
explicit instruction "go ahead till ws13 is finished")

## Git state

- Branch: `feature/australia-property-intelligence-v3`
- Commit: `d778478`
- Working tree: **clean**
- Base: Sprint 10's `feature/deal-analyser-budget-2026` HEAD (`599beae`),
  preserved unmodified, no commits rewritten
- All commits through `d778478` have been pushed to origin.

## Supabase target

- Validation branch: `warehouse-validation`, ref **`lzonauinzatmtytyoems`**
  — the only allowed write target.
- Production ref **`oshquaxsloolqucwvigc`** — confirmed zero warehouse
  schema tables at this checkpoint (re-verified live).
- Branch DB size: **2,630 MB** — comfortably under the 4,500 MB internal
  working ceiling.
- **Migrations applied this session**: 018 (`mart.lga_rent_quarterly`),
  019 (`mart.sa2_dwelling_stock_2021` / `mart.lga_dwelling_stock_2021`),
  020 (`get_market_map_markers_v1` RPC + QLD/SA/WA added to
  `meta.jurisdiction`), 021 (widened `compare_market_geographies_v1` to
  2-10 geographies). All applied and verified live.

## What's done (Workstreams 0-13)

Summary of 0-8 — see prior checkpoint commits for full detail: Sprint 10
preserved; capacity audit; national source discovery; coverage contract;
Census harmonisation (branch); SA2 population layer (local); QLD/SA/WA
rent + NSW 1990-2000 sales archive (local); local data lake catalogue.

**WS9 (canonical marts) — COMPLETE, two sub-passes:**
1. QLD/SA/WA rent promoted to `core.fact_rental_market_summary` +
   `mart.suburb/postcode/lga_rent_quarterly` (402,971 fact rows). Found
   and corrected a wrong assumption: pre-existing LGA facts were NSW's
   (dormant since Sprint 6), not VIC's.
2. `mart.sa2_dwelling_stock_2021` / `mart.lga_dwelling_stock_2021` built
   as a direct pass-through of already-existing native SA2/LGA Census
   facts (2,454 + 547 rows) — no new data load needed.
   Deferred (documented, not fabricated): wide demographic profiles at
   SA2/LGA (needs a new local Census build), NSW archive sales promotion,
   `mart.suburb_market_snapshot` extension for QLD/SA/WA.

**WS10 (research indicators) — COMPLETE.** `research_indicators.yml` +
`RESEARCH_INDICATOR_DEFINITIONS.md` document every indicator already
computed in the warehouse — no new computation, pure transparency work.
Explicitly documents what's excluded by design (composite scores,
rankings, recommendations, AVMs, forecasts).

**WS11 (national map explorer) — COMPLETE.** `/research/map`, Leaflet +
OpenStreetMap (free, no API key). `get_market_map_markers_v1` RPC
(migration 020) — bounding-box-limited, row-capped, covers all 5 loaded
jurisdictions. Found and fixed two real bugs during live browser testing:
snapshot placeholder rows wrongly reporting `has_full_snapshot=true`, and
the rent fallback picking a NULL "latest" quarter instead of the latest
quarter with real data. Verified live: 500 NSW markers + QLD rent-only
markers both render correctly with correct colours.

**WS12 (comparison workspace) — COMPLETE.** Widened
`compare_market_geographies_v1` (migration 021) from 2-5 to 2-10
geographies; updated Explore selection UI and Compare page validation.
Verified live: 8-geography comparison renders correctly, 11 is correctly
rejected.

**WS13 (research report export) — COMPLETE.** `ExportButtons` component
(CSV/JSON/Print, no PDF library — browser print-to-PDF satisfies "no PDF
unless free local tooling"), wired into `/research/compare`. Global print
CSS added (forces black-on-white regardless of dark theme). Verified live
by intercepting `URL.createObjectURL` to inspect actual generated file
content — both CSV and JSON confirmed correct.

## What's NOT done — Workstreams 14-22

Refresh engine v2, GitHub Actions schedules, data-status console
expansion, security/performance hardening beyond WS1's measurement pass,
new feature flags (WS18 — note WS11/12/13's new UI is currently gated
behind the EXISTING `MULTI_STATE_RESEARCH_ENABLED` flag, reused rather
than inventing new flags ahead of WS18's dedicated pass), comprehensive
testing, remaining migrations, further documentation, final report/PR.

Also still queued from WS9: wide demographic profiles at SA2/LGA, NSW
archive sales promotion into `core.fact_residential_sales_summary`, and
extending `mart.suburb_market_snapshot`/`postcode_market_snapshot` with
QLD/SA/WA rows.

## Unresolved blockers (none sprint-wide)

- Sprint 10 PR: documented, user-approved skip.
- TAS sales: still only search-verified (low priority).
- WA sales licence unclear: documented, needs human judgement if revisited.
- WS7's 6.3GB local cleanup plan: written, not executed — human decision pending.

## Commands/actions that must NOT be repeated

- Don't re-run WS0's Sprint 10 re-verification suite as a first resume action.
- Don't attempt `gh pr create` without confirming `gh` is installed/authenticated.
- Don't re-run any WS4/5/6/8 local-store build scripts — all complete and committed.
- Don't attempt a TAS rent adapter or re-check CBOS/DOJ Tasmania — confirmed Cloudflare-blocked.
- Don't re-run `load_qld_sa_wa_rents_to_branch.mjs --execute` or
  `load_sa2_lga_dwelling_stock_to_branch.mjs --execute` — both already committed to the branch.
- Don't run the WS7 cleanup plan's `rm -rf` commands without explicit human approval.
- Don't assume `core.fact_rental_market_summary`'s LGA rows are VIC's — they are NSW's.
- Don't invent new feature flags for research UI routes — WS18 owns that; the existing
  `MULTI_STATE_RESEARCH_ENABLED` flag is the correct gate to reuse until WS18 runs.
- When testing in a browser, remember the `gstack /browse` daemon resets state between
  separate Bash calls — chain `goto` + follow-up commands within ONE call, and re-snapshot
  for fresh @refs after any daemon restart message.

## Exact next command

```bash
git status --short && git log --oneline -3
```

## Exact next task

The user's explicit scope for this session ("go ahead till ws13 is
finished") is now complete. On resume, either:
(a) continue autonomously into **Workstream 14** (incremental national
refresh engine v2) if the standing "autonomous sprint execution" guidance
applies, or
(b) wait for explicit user direction on which workstream to pick up next,
given the last two user messages in this session were scoped requests
("go ahead till ws13", not an open-ended "continue the whole sprint").
Check the actual conversation for which applies before proceeding.

If resuming into WS14: no local build work is needed first — this is a
refresh-orchestration engineering task (dependency graph, hash-based
skip, checkpoints, resumability) building on the existing v1 orchestrator
from Sprint 10.

## Resume verification checklist

1. `git status --short` — confirm still on
   `feature/australia-property-intelligence-v3`, clean.
2. Confirm HEAD is `d778478` (trust actual git log over this doc if they disagree).
3. Confirm `WAREHOUSE_VALIDATION_DB_URL` in `.env.local` still points at
   `lzonauinzatmtytyoems`, never `oshquaxsloolqucwvigc`.
4. No dev server or browse daemon should be running — verify with
   `curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000`
   (expect connection failure/000) before starting a new one.
5. Resume per "Exact next task" above.

## Scheduled resume

Scheduled via the `ScheduleWakeup` tool immediately after this checkpoint
was written — see the tool call result for the exact time.
