# National Refresh Schedule (Sprint 11, Workstream 15)

Companion doc to `warehouse/config/refresh_schedule.yml` (machine-adjacent
reference) and the three workflows in `.github/workflows/`.

## Cadence, matched to actual publication frequency

| cadence | what runs | datasets |
|---|---|---|
| Daily | Source URL availability (HTTP status only), public research interface build health | all source domains (informational, not dataset-specific) |
| Weekly (Mondays) | Discovery-script inventory check, licence-page drift (documented as a manual follow-up this pass — see "What's lighter than the full spec" below) | all jurisdictions |
| Monthly | Datasets that genuinely publish monthly | `building_approvals`, `rba_interest_rates`, `wa_rents` |
| Quarterly | The majority of rent/sales sources | NSW/VIC/QLD/SA rent and sales datasets |
| Annual | Geography/Census reference review — a genuine new ASGS or Census edition is a multi-week onboarding effort, not a routine refresh | `asgs_geography_backbone`, `cross_census_harmonisation`, `census_dwelling_stock`, `census_demographics`, `national_population_layer` |

## The three workflows

1. **`warehouse-source-monitor.yml`** — scheduled (daily + weekly),
   read-only, no Supabase credentials available to it at all. Checks a
   representative set of source domains' HTTP status and confirms the
   Next.js build still succeeds (a no-credential proxy for "the research
   routes aren't broken").
2. **`warehouse-validation.yml`** — runs on every push/PR. Standard CI:
   `warehouse:check`, `npm test`, `npm run lint`, `npm run build`, plus a
   large-file git scan. No network calls to external data sources.
3. **`warehouse-manual-refresh.yml`** — the ONLY workflow that can write
   to Supabase, and only via an explicit human `workflow_dispatch`. A
   dedicated `guard` job refuses anything where the `target` input isn't
   literally the string `"validation"`, before checkout even runs.
   `refresh_engine_v2.mjs` (Workstream 14) then independently re-checks
   the actual connection string against the production ref before
   opening any database connection — two independent layers of
   protection, not one.

## What's genuinely automated vs. what stays manual

- **Automated**: daily/weekly monitoring (read-only), CI validation on
  every push, and a manually-triggered (never scheduled) refresh
  pathway that still requires explicit target confirmation.
- **Manual by design**: any actual data download from a government
  source. No workflow in this project downloads a real dataset file —
  even `warehouse-manual-refresh.yml`'s `--local-only`/`--branch-load`
  modes assume the underlying build script's download step succeeds in
  the CI runner's network context, which for sources requiring the
  `gstack /browse` headed-browser technique (NSW, VIC, TAS attempts) will
  simply fail cleanly rather than silently degrade — those sources remain
  a human-triggered local operation, consistent with every prior sprint.
- **Never automated**: purchasing a paid dataset, bypassing bot
  protection, merging the validation branch, or deploying to production.
  None of these actions exist in any workflow in this repository.

## What's lighter than the full Workstream 15 specification (documented, not hidden)

- **Licence-page drift detection** is represented as an inventory check
  (confirms discovery scripts exist) rather than a live hash-comparison
  of each licence page's actual text — implementing genuine drift
  detection would mean the weekly job making real HTTP calls to ~15
  government licence pages from a GitHub-hosted runner, which several of
  this project's sources (NSW, VIC) are known to Cloudflare-challenge for
  non-browser clients. A future pass could add this for the sources that
  don't require the headed-browser technique.
- **Coverage review** (quarterly) and **historical reconciliation**
  (annual) are documented as manual review triggers in
  `refresh_schedule.yml`, not automated report-generation jobs — both
  already exist as on-demand scripts (`warehouse/scripts/quality/`,
  various `validate_*` scripts) that a human runs when reviewing.

## Concurrency and safety

Every workflow uses a `concurrency` group to prevent two runs of the same
workflow racing each other. `warehouse-manual-refresh.yml` additionally
sets `cancel-in-progress: false` — a branch write mid-transaction must
never be cancelled out from under itself; the underlying
`refresh_engine_v2.mjs` run-lock (Workstream 14) provides the actual
mutual-exclusion guarantee regardless of what GitHub Actions does.
