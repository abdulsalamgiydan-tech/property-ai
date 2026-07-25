# Sprint 12, Workstream 4 — 2016-2021 Boundary Reconciliation

## Starting point (inspected before changing anything, per instructions)

Sprint 11 WS4 already built a real, validated population-weighted
correspondence (SSC 2016→SAL 2021, POA 2016→POA 2021), reconciling to
100.00% nationally. Sprint 12 WS1's audit found this was NOT the
"deferred, unresolved" state the Sprint 12 mission's premise assumed —
but it did find one genuine defect: `population_growth_2016_2021_pct`
shared the same row-level `geography_method='direct'`/
`confidence_label='official'` fields as the directly-published 2021
figures, conflating direct and derived provenance in one field. And the
correspondence relationship itself never left the local DuckDB store —
only the final converted numbers were pushed to the branch.

## What this workstream did

**Did not rebuild the population math** (already correct, already
validated). **Did** build the missing piece: a genuine, queryable,
version-aware geography bridge on the branch, and fixed the lineage
defect with dedicated columns rather than relabelling.

### Schema (migrations 027, 028)

- `core.bridge_geography_correspondence` gained `quality_label` (raw ABS
  label, not just a numeric score), `reconciliation_residual_pct`
  (per-source), `source_dataset_id`, and a **natural-key uniqueness
  constraint** (none existed before — a real gap, closed).
- `mart.suburb_demographic_profile_2021` / `postcode_demographic_profile_2021`
  gained 4 dedicated columns: `population_growth_method`,
  `population_growth_confidence`, `population_growth_correspondence_version`,
  `population_growth_source_dataset_id` — describing the growth metric
  specifically, never conflated with the row's general fields.

### Data loaded (all additive, all independently re-verified live after commit)

| what | count |
|---|---|
| `core.dim_geography_version` new editions | 2 (`SSC_ABS_2016`, `POA_ABS_2016`) |
| `core.dim_geography` new rows (2016, `is_current=false`, no geometry) | 17,974 (15,304 SSC + 2,670 POA) |
| `core.bridge_geography_correspondence` new rows (all quality levels) | 18,616 (15,735 SSC→SAL + 2,881 POA→POA) |
| `mart.suburb_demographic_profile_2021` rows updated | 15,333 |
| `mart.postcode_demographic_profile_2021` rows updated | 2,641 |

Branch storage: 2,655.4 MB → 2,661.5 MB (+6.1 MB) — negligible, well
under the 3,375 MB Sprint 12 budget.

### Real bugs found and fixed during this workstream (not just the planned lineage fix)

1. **My own first draft had the exact bug WS1 warned about**: the initial
   build script's `dim_geography_2016_ssc`/`_poa` and correspondence
   tables didn't filter NULL source/target codes, causing an insert
   failure against real constraints. Investigating (not just excluding
   blindly) found 3 genuine ABS special/non-spatial cases — a new SAL
   with no 2016 predecessor, tiny unallocated population residuals ABS
   itself couldn't assign a target to, and per-state "No usual address"/
   "Migratory - Offshore - Shipping" pseudo-codes that were never part of
   the ASGS geometry backbone this project loaded in Sprint 2-4. All
   three are now handled explicitly (logged, documented, excluded
   consistently with how the rest of the platform already treats them) —
   see `CROSS_CENSUS_HARMONISATION_METHOD.md` for the full breakdown.
2. Excluding these correctly dropped the naive "100.00%" national
   reconciliation figure to a more honest **99.80%** — the 0.20% gap is
   the genuine no-fixed-address/migratory population that cannot be
   geographically attributed, not a defect. Still comfortably within the
   documented ±0.5% tolerance.
3. `core.bridge_geography_correspondence` had no natural-key uniqueness
   constraint at all (only a surrogate UUID PK) — confirmed zero existing
   violations, added the constraint (migration 028) so this and any
   future loader is safely idempotent, not silently duplicate-prone.

## Validation (all independently re-verified against the committed branch, not the load script's own report)

- 2 editions registered ✓
- Duplicate natural keys: 0 ✓
- Orphan source geography codes: 0 ✓ (FK-enforced, independently re-checked)
- Orphan target geography codes: 0 ✓
- Invalid weights: 0 ✓
- 100% of populated growth figures carry complete lineage (method +
  confidence + correspondence_version) — 0 missing ✓
- `population_growth_method` never equals the row's `geography_method` —
  proves the lineage fields are genuinely separate, not a relabel ✓
- National reconciliation: SAL 99.80%, POA 99.80%, both within the
  documented ±0.5% tolerance ✓
- **Manual split-geography spot check**: `SSC_12199` (a 2016 Snowy
  Mountains locality) splits into 9 real 2021 SALs — Thredbo (80.5%),
  Perisher Valley (14.4%), and 7 near-zero wilderness slivers, ratios
  summing to 0.9999999. Verified plausible: a known NSW alpine-resort
  area subdivided into named villages between 2016 and 2021.

Full check output in `warehouse/scripts/geography/validate_2016_2021_geography_bridge.mjs`'s
run log (re-runnable any time, read-only).

## Sample: the lineage fix in a real row

| field | Parramatta |
|---|---|
| `geography_method` | direct |
| `confidence_label` | official |
| `total_population` (2021) | 30,211 |
| `population_2016` | 25,745 |
| `population_growth_2016_2021_pct` | 17.35% |
| `population_growth_method` | **derived** |
| `population_growth_confidence` | **high** |
| `population_growth_correspondence_version` | ABS_2016_to_ASGS3_2021 |

Direct and derived provenance now coexist in the same row without being
conflated — the exact fix WS1 asked for.

## Tests

`warehouse/scripts/geography/build_2016_2021_geography_bridge.test.ts` —
7 tests, 4 of which run the real build script against real local ABS
files (skip cleanly in a clean CI clone, which never has the gitignored
raw data — matching this project's "no required local data for ordinary
CI" rule) plus 3 structural/safety tests that always run (production
rejection present, dry-run default, idempotent ON CONFLICT, no
INSERT/UPDATE in the read-only validator). All 7 pass locally.

## Deferred, documented not hidden

- SA2-grain 2016→2021 correspondence (`CG_SA2_2016_SA2_2021.csv`, already
  downloaded in Sprint 11, not yet used) — SAL/POA are this project's
  primary residential research grains; SA2 remains available for a
  future cross-validation pass, not required for this workstream.
- Household/dwelling growth (only total population converted, matching
  the original Sprint 11 WS4 scope — extending to households/dwellings
  would need the same treatment applied to different Census G01 columns).

## Files

- `supabase/migrations/027_boundary_reconciliation_lineage_columns.sql`
- `supabase/migrations/028_bridge_correspondence_natural_key.sql`
- `warehouse/scripts/geography/build_2016_2021_geography_bridge.mjs`
- `warehouse/scripts/geography/load_2016_2021_geography_bridge_to_branch.mjs`
- `warehouse/scripts/geography/validate_2016_2021_geography_bridge.mjs`
- `warehouse/scripts/geography/build_2016_2021_geography_bridge.test.ts`
- `warehouse/docs/CROSS_CENSUS_HARMONISATION_METHOD.md` (extended)
- `warehouse/docs/NATIONAL_METRIC_DEFINITIONS.md` (corrected stale note)
- `warehouse/metadata/metric_dictionary.csv` (new row)
- `warehouse/reports/geography_bridge_2016_2021_local_build.json`
- `warehouse/reports/geography_bridge_2016_2021_branch_load_report.json`
