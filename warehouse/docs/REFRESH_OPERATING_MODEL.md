# Refresh Operating Model (Sprint 10, Phase 13)

## No schedule enabled

Every refresh this sprint is manual, on demand. No cron job, no Supabase
Edge Function schedule, no CI trigger, nothing automated was created. This
document describes how a human runs a refresh; it does not describe an
automated pipeline.

## Metadata

- `meta.dataset_refresh_policy` — declarative cadence/discovery-method per
  dataset. Source of truth is `warehouse/config/refresh_policies.yml`,
  loaded into this table.
- `meta.dataset_refresh_run` — one row per orchestrator invocation. A
  failing run for one dataset never blocks or corrupts another dataset's
  row (each dataset gets its own row).
- `meta.dataset_freshness_status` — computed snapshot, refreshed by
  `check_freshness.mjs`. Backs the `/research/data-status` page.

## Scripts (`warehouse/scripts/orchestration/`)

| script | writes | purpose |
|---|---|---|
| `plan_refresh.mjs` | none (read-only) | shows which datasets are due/stale vs `expected_cadence_days` |
| `run_refresh.mjs` | `meta.dataset_refresh_run`, local files, (with `--branch-load`) branch mart tables | dispatches to each dataset's known build/validate scripts |
| `check_freshness.mjs` | `meta.dataset_freshness_status` only | computes and records freshness — never touches mart/core data |
| `generate_refresh_report.mjs` | none (read-only) | summarizes recent runs + freshness into `refresh_dry_run_report.{json,md}`, and proves the production-target rejection live |

## Modes

- `--plan` — describe what would run, no execution.
- `--dry-run` (default) — same as plan, explicit.
- `--dataset=<id>` / `--jurisdiction=<state>` — scope to one dataset or state.
- `--local-only` (default when `--execute` is used without `--branch-load`) — runs the local build+validate scripts only, no Supabase connection made for data writes.
- `--branch-load` — explicit opt-in required to load compact curated summaries to the branch. Delegates to the dataset family's existing branch-load script (e.g. `load_vic_market_intelligence_to_branch.mjs --execute`).
- `--no-download` — skip any download step (not yet exercised this sprint, since no dataset here has an automated download step — see below).
- `--since=<date>` — accepted but not yet used to filter partial-history refreshes (all current datasets replace their full latest-quarter local store on each run).

## What `run_refresh.mjs` does NOT automate

Every VIC dataset's raw file requires either a headed-browser session
(VPSR sales, Cloudflare-protected) or a manual publications-page check (VIC
rent, no CKAN/API discovered). `run_refresh.mjs` does not attempt either —
it fails cleanly with the exact command needed
(`gstack /browse --headed download ...`) rather than attempting an
unreliable automated download. This matches the sprint's rule against bot
protection bypass: the resolution is a real headed browser session, an
interactive step, not something a background script should silently
attempt.

## Idempotency and resumability

- `build_vic_sales_local_store.mjs` / `build_vic_rents_local_store.mjs`
  rebuild their local DuckDB store from scratch on every run (drop +
  recreate the local file, not the branch) — safe to re-run any number of
  times.
- `load_vic_market_intelligence_to_branch.mjs` uses `ON CONFLICT ... DO
  UPDATE` upserts throughout — a re-run after a partial failure is safe
  and idempotent, matching the pattern established in Sprint 10 Phase 1's
  NSW reconciliation.
- File downloads are content-hashed (SHA-256) in
  `vic_sales_download_inventory.json` / `vic_rents_download_inventory.json`
  — a future enhancement (not built this sprint) could skip re-downloading
  an unchanged file by comparing hashes.

## Verified this sprint

- `plan_refresh.mjs` run live against the branch: correctly identified all
  7 policy-registered datasets as `never_refreshed_locally` (since they
  were built directly, not yet run through this orchestrator).
- `run_refresh.mjs --target=production` rejected before any write, proven
  live and captured in `refresh_dry_run_report.json`'s
  `production_rejection_proof` field.
- `check_freshness.mjs --execute` run live: populated
  `meta.dataset_freshness_status` for all 7 VIC/NSW policy rows, correctly
  showing `branch_published` with real row counts (741 VIC snapshot rows)
  for the VPSR datasets.
