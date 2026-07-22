# Sprint 12, Workstream 2 — TAS/ACT/NT Onboarding

## What this workstream did

1. **Registered TAS/ACT/NT in `meta.jurisdiction`** (migration 025) —
   confirmed gap from WS1's audit: all 3 had ASGS geography loaded
   nationally since Sprint 2-4 but were never registered, so any code
   joining on `meta.jurisdiction` (map markers, comparisons) would show a
   NULL jurisdiction label for them.

2. **Discovered and loaded a genuine official sales source for all
   three jurisdictions**: ABS's "Residential Property Price Indexes:
   Eight Capital Cities" (cat. 6432.0) — the series the earlier Sprint 11
   WS2 discovery pass checked — **ceased after the December 2021 issue**.
   Its live successor, "Total Value of Dwellings" (same catalogue number,
   current release: March Quarter 2026, published 9 June 2026), continues
   median price and transfer-count series per state/territory, split
   "capital city" vs "rest of state" — exactly the ASGS GCCSA grain this
   project already has loaded. Downloaded, validated (content-type, ZIP/
   xlsx file signature, plausible size), parsed, and loaded 928 rows into
   `core.fact_residential_sales_summary` at GCCSA grain:
   - Greater Hobart / Rest of Tas. (TAS)
   - Greater Darwin / Rest of NT (NT)
   - Australian Capital Territory (ACT — no "rest of ACT" split published)

   Two dwelling types per geography (`detached_house`,
   `attached_dwelling` — the latter a new, distinct vocabulary value since
   ABS's bundled unit+townhouse+semi category doesn't match this
   project's existing `apartment_unit` term), quarterly from 2002/2003
   through March 2026. Independently re-queried live after commit (not
   just trusted the load script's own report) — 928 rows confirmed across
   all 10 geography x dwelling_type combinations, correct reference
   periods.

3. **Updated `meta.jurisdiction` status** (migration 026) from
   `national_context_only` to `sales_only` for all 3 — matching the
   existing `rent_only` vocabulary pattern already used for QLD/SA/WA.

4. **Live-reconfirmed TAS rent remains blocked**, not just carried
   forward from Sprint 11's finding. Navigated to CBOS Tasmania (the
   tenancy regulator) directly via a real browser session: **HTTP 403,
   Cloudflare "Performing security verification" challenge page**,
   confirmed live today. Per this project's hard rule against bypassing
   CAPTCHA/WAF/access controls, this is a genuine, current blocker, not
   worked around. Status unchanged: `blocked_access`.

5. **Corrected `jurisdiction_coverage.yml`** for TAS/ACT/NT: sales moved
   from `unavailable`/`official_source_restricted` to
   `partially_available` (GCCSA grain, not SAL/POA) with full source
   detail; `affordability` moved from `unavailable` to `derived` now that
   a sales price input exists; `yields` clarified as still `unavailable`
   pending rent.

6. **Re-ran WS1's coverage-registry generator** — confirms the new sales
   data live (370 rows for TAS, matching NT/ACT proportionally) without
   any manual editing of the generated files.

## Storage impact

928 new rows in `core.fact_residential_sales_summary` — negligible
(kilobytes, not megabytes). Branch remains at ~2.6 GB, far under the
Sprint 12 budget (3,375 MB / 75%).

## What this does NOT do

- Does not attempt SAL/POA-grain sales for TAS/ACT/NT — no free source at
  that grain was found for any of the three; GCCSA is the finest grain
  ABS's national aggregate series publishes.
- Does not load rent for any of the three — TAS remains Cloudflare-blocked
  (live-reconfirmed), ACT/NT remain zero-result on their official open-
  data portals (Sprint 11 WS2 findings, not re-litigated this pass since
  nothing indicated they'd changed).
- Does not attempt Table 1 of the same ABS publication (aggregate national
  totals, not geography-split — not useful for this project's per-
  jurisdiction model).
- Does not touch NSW/VIC/QLD/SA/WA's existing sales data — purely
  additive, `ON CONFLICT DO NOTHING` throughout, verified zero rows
  changed for any pre-existing dataset_id.

## Files

- `supabase/migrations/025_tas_act_nt_jurisdiction_registration.sql`
- `supabase/migrations/026_tas_act_nt_sales_only_status.sql`
- `warehouse/scripts/sales/download_abs_tvd_source.mjs`
- `warehouse/scripts/sales/build_abs_tvd_local_store.mjs`
- `warehouse/scripts/sales/load_abs_tvd_to_branch.mjs`
- `warehouse/reports/abs_tvd_download_inventory.json`
- `warehouse/reports/abs_tvd_local_store_report.json`
- `warehouse/reports/abs_tvd_branch_load_report.json`
- `warehouse/config/jurisdiction_coverage.yml` (corrected)
- `warehouse/metadata/national_coverage_registry.yml`,
  `warehouse/reports/national_coverage_audit.{md,json}` (regenerated)

## Validation

- `npm run warehouse:check`: pass
- `npm run lint`: 0 errors, 6 warnings (all pre-existing, unrelated)
- `npm test`: 72/72 pass
- Live re-query after commit: 928 rows confirmed in
  `core.fact_residential_sales_summary` for `dataset_id =
  'abs_tvd_tas_act_nt_gccsa'`, matching the load script's own count exactly
- Production: untouched (all writes went to `warehouse-validation` only,
  connection-string guard verified before every DB connection)
