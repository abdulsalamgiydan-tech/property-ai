# Sprint 12 Foundation Block — Known Gaps

Every gap below is documented, not hidden. None are hard stops for the
Foundation Block (WS3/WS4/WS6/WS8/WS9/WS10) being considered complete —
each is either a genuine external data-availability limit, an
architecture question intentionally deferred to a named future
workstream, or a low-volume anomaly under active tracking.

## Data-availability limits (external, not fixable by this project)

- **TAS rent**: CBOS Tasmania blocked by Cloudflare bot-protection,
  live-reconfirmed twice this sprint (WS2). Not bypassed — this project's
  hard rule against CAPTCHA/WAF evasion applies.
- **ACT/NT rent**: no free public rent source identified as of Sprint 12.
- **QLD postcode-grain (POA) rent**: `mart.postcode_rent_quarterly` has
  zero QLD-range rows even though `mart.suburb_rent_quarterly` (SAL grain)
  has 634 — the RTA source appears to only ever be geocoded to suburb,
  not postcode.
- **ABS internal migration**: "Regional internal migration estimates,
  provisional" exists but its latest release is from March 2021 (5+ years
  stale as of this check) — not built on an unverified/discontinued
  source.

## Architecture gaps deferred to a named future workstream

- **TAS/ACT/NT sales cannot appear in the SAL/POA-grain wide snapshot
  marts.** Their only sales data (`abs_tvd_tas_act_nt_gccsa`) is
  GCCSA-grain — a coarser `geography_type`. Rolling it into
  `mart.suburb_market_snapshot`/`postcode_market_snapshot` would be a
  fabricated cross-grain mapping. A future GCCSA-grain snapshot mart is
  the correct fix, not attempted this sprint.
- **QLD/SA/WA yield is not computed** — all three have zero sales rows at
  any grain, so there is no price to pair with rent. Matches their
  registered `meta.jurisdiction.status = 'rent_only'`.
- **VIC rent has no queryable quarterly history mart.** Unlike NSW/QLD/SA/
  WA, VIC's rent was loaded directly into `mart.suburb_market_snapshot`'s
  columns by a Sprint 10 pipeline and never populated
  `core.fact_rental_market_summary` — a real, pre-existing architecture
  inconsistency, documented in `meta.metric_lineage_registry`
  (`rent` / `VIC` / `transformation_method = 'direct_load_snapshot_only'`).
- **10 of 25 registry datasets have no `meta_dataset_ids` mapping** (WS10)
  — derived/combined-loader datasets (e.g. `national_snapshot_rollup`,
  `sa2_lga_dwelling_stock_marts`) with no single source dataset to map
  onto `meta.dataset_freshness_status`'s id namespace. Honestly left
  unmapped rather than guessed; they simply never appear in `--stale`
  selection until a real mapping exists.
- **No dataset has ever completed a tracked orchestrator run** —
  `meta.dataset_freshness_status` shows all 7 datasets it currently
  tracks as `manual_review`, not because they're actually unhealthy but
  because nothing has run through `refresh_engine_v3.mjs --branch-load`
  for real yet (every Sprint 9-12 load was a bespoke one-off script
  invocation). This is expected at this stage, not a defect — closing it
  requires a human-supervised real refresh run, which this workstream
  deliberately did not attempt unattended.

## Anomalies under active tracking (advisory, not blocking)

- **Cross-border postcode sales attribution** (`cross_border_postcode_sales`
  rule, 16 rows) — see `sprint12_cross_border_anomaly_report.md`.
- **Geography correspondence weight reconciliation** (`weight_reconciliation_bridge`
  rule, 6 source geographies out of tolerance) — consistent with WS4's own
  documented 99.80% (not 100%) national reconciliation accuracy; expected,
  not a regression.
- **Source URL health false positives** — Node's `fetch()` is unreliable
  against several ABS/gov hosts in this environment (curl succeeds on the
  same URLs, established earlier this sprint during the CI/download
  investigation). A failure from `source_url_health` should be
  re-verified with curl before treating it as a real outage.

## npm audit (pre-existing, not introduced by this Foundation Block)

`npm ci` reports 12 vulnerabilities (2 low, 3 moderate, 6 high, 1
critical) in the existing dependency tree. None were introduced by
Sprint 12 — no new dependencies were added by WS3/WS4/WS6/WS8/WS9/WS10
(only `pg`, already present, and Node built-ins are used). Not
remediated here (`npm audit fix --force` could introduce breaking
changes without review) — flagged for a human decision, not silently
ignored.
