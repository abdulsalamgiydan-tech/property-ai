# Refresh Scheduling — Design Only (Sprint 12 WS10)

**Nothing in this document is activated.** No Task Scheduler job is
registered, no GitHub Actions cron workflow exists in this repository.
This is a design for a human to review and turn on deliberately — matching
this project's standing rule against production automation without
explicit approval, and the mission's explicit "do not activate any
production refresh schedule, do not add paid automation."

## Why not activated yet

- Every dataset in `warehouse/config/refresh_registry.mjs` still requires
  a real, gitignored local raw-data download for most jurisdictions —
  several sources are only reliably fetchable via a real browser session
  (Cloudflare/WAF-protected) or `curl` with a specific user agent (Node's
  `fetch()` is unreliable against some ABS hosts in this environment, see
  `sprint12_ws9_data_quality_report.md`). An unattended scheduled job would
  fail silently on exactly the sources this project has had to work around
  by hand.
- `meta.dataset_freshness_status` currently shows every tracked dataset as
  `manual_review` (WS9's finding) — there is no track record yet of this
  orchestrator completing a real end-to-end scheduled run to base a
  cadence decision on.
- Automated branch writes without a human present would bypass this
  project's established checkpoint discipline (re-verify live after every
  commit, never trust a script's own report).

## Local Windows Task Scheduler (free, no CI minutes used)

A `.xml` task definition (not created by this workstream) would run:

```powershell
node warehouse/scripts/orchestration/refresh_engine_v3.mjs --execute --branch-load --stale
```

- **Trigger**: weekly, e.g. Sunday 02:00 local time (matches the slowest
  registered `expected_cadence_days` — quarterly/monthly sources don't
  need daily checks).
- **Condition**: only run if `warehouse/data/local/refresh_runs/.lock`
  does not exist (the engine's own lock file already prevents overlap;
  Task Scheduler's "don't start a new instance if already running" is a
  second, redundant guard).
- **Action on failure**: Task Scheduler's built-in email/event-log
  notification on non-zero exit code — `refresh_engine_v3.mjs` already
  exits 1 on `promotion_blocked` or `failed`, so this requires no new
  code, just wiring the existing exit code to a notification.
- **Requires**: `.env.local` present on the machine running the task
  (never committed) and a person available to review the run's report
  before trusting it — this is a *convenience* trigger for a human-
  reviewed refresh, not unattended automation of branch promotion.

## GitHub Actions (free tier, where repository limits allow)

A separate workflow (not the existing `warehouse-validation.yml`, which
must stay a pure CI check with no secrets) could run on a `schedule:` cron
trigger:

```yaml
on:
  schedule:
    - cron: "0 16 * * 0"  # Sunday 02:00 AEDT / 16:00 UTC Saturday
  workflow_dispatch: {}     # manual trigger for testing, never automatic on push
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: node warehouse/scripts/orchestration/refresh_engine_v3.mjs --dry-run --stale
        # NOT --execute --branch-load in the first version -- a
        # GitHub-hosted runner would need WAREHOUSE_VALIDATION_DB_URL as a
        # repository secret, which means this workflow could write to the
        # branch on every scheduled tick with no human present. Start with
        # dry-run only (reports what WOULD refresh) and require a human to
        # promote to --execute after several dry-run cycles build
        # confidence, exactly the same graduated-trust pattern already
        # used for this project's own CI (warehouse:check before test
        # before lint before build).
```

- **Constraint**: most of this registry's `build_script`s need the
  gitignored raw source files already downloaded locally — a fresh GitHub
  runner starts with none of them. A scheduled Actions run is realistically
  only useful for the `--dry-run`/`--validate`/quality-gate-only path (no
  local raw data needed) until a source-download step is added per
  dataset — a distinct future workstream, not assumed here.
- **Free tier**: public repos get unlimited Actions minutes; a private
  repo gets a monthly free quota — a weekly dry-run job is negligible
  either way (~1-2 minutes per run).

## What this workstream actually shipped instead

`refresh_engine_v3.mjs --validate` is the safe, already-working piece of
this design: a read-only check (no local raw data required) that connects
to the branch and runs WS9's quality gate against current state. This is
suitable for a scheduled job TODAY, unlike the full `--execute
--branch-load` path. Recommended first automation step, if a human
chooses to activate one: `warehouse:refresh:validate` on a schedule,
nothing else, until the raw-data-download gap above is closed.
