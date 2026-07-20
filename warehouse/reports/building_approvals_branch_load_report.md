# Building Approvals Branch Load Report (Sprint 4, Part D)

Generated: 2026-07-20 (run details: `building_approvals_branch_load_report.json`)
Source: local DuckDB store `building_approvals.duckdb` (validated PASSED), curated to
the trailing 12 months + 1 rolling-12m total (full 59-month series stays local).
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production touched: NO** (zero warehouse schemas on `oshquaxsloolqucwvigc`, re-verified
after commit). **Frontend changed: NO.** Migration 007 applied to the branch only.

## Loaded (branch core + mart)

| table | rows | notes |
|---|---|---|
| `core.fact_building_approvals` | 95,550 | 88,200 monthly (12 months × 3 dwelling types × 2,450 SA2s) + 7,350 rolling-12m; 312 special-code SA2 cells excluded by the dim join |
| `mart.suburb_building_approvals` | 15,329 | 15,227 fully `sa2_dwelling_weighted`, 102 `sa2_mixed_dwelling_area_weighted`; **approvals_per_1000_dwellings populated for 14,535 rows** |
| `mart.postcode_building_approvals` | 2,638 | 2,631 with `approvals_per_1000_dwellings` populated |

Confidence labels: 15,227 high, 102 low (the mixed-weighted set). No `insufficient_data`
rows — Sprint 3's dwelling-stock marts cover essentially the full backbone.

## Blocking gates (in-transaction, re-verified independently after commit)

Duplicate fact grain **0** · NULL `geography_id` **0** · negative approval counts **0**
· orphan geography ids **0**.

## Approvals per 1,000 dwellings: **created — yes**

Built for both suburb and postcode marts from rolling-12m SA2 facts carried through
the dwelling-weighted correspondence bridge, divided by `total_private_dwellings`
from the Sprint 3 Census marts (× 1,000). NULL where 2021 dwelling stock is 0 or
unavailable — never divided by zero, never inferred.

## National consistency check

12-month total approvals: suburb mart 200,687, postcode mart 201,350, vs the local
store's direct national total 201,349 — postcode ties out almost exactly (correspondence
is closer to 1:1 for POA); the suburb figure is close, with the small gap coming from
SA2s whose SAL correspondence weights are only partially dwelling-based.

## Notable pattern: extreme per-1,000 values in growth-corridor suburbs

The highest `approvals_per_1000_dwellings` values (e.g. Jacka ACT 1,102.9, Plumpton
Vic 538.5, Exford Vic 527.8, Moorina Qld 510.6, and one near-empty catch-all SAL at
64,666.7) all belong to well-known outer-growth-corridor localities where the 2021
Census baseline was near-empty land, followed by substantial new-estate construction.
This is the intended signal, not a data defect — `existing_dwellings_2021` is exposed
alongside the ratio so consumers can see the denominator. No smoothing, scoring or
suppression applied (per the "no suburb scores/forecasts yet" rule).

## Capacity

Branch DB now **1,540 MB**. Local-first curation (13 of 59 months promoted) kept this
addition small (~53 MB) despite the full local series being 59 months.

## Next step

Sprint 5 candidates: NSW Valuer General sales (first market-price source, enables
suburb/postcode price + yield metrics) or RBA rates (national finance context). RLS
on warehouse schemas still undecided before anything approaches production.
