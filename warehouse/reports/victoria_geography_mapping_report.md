# Victoria Geography Mapping Report (Sprint 10, Phase 4)

Generated: 2026-07-21T10:01:33.733Z

Scope: Victorian Property Sales Report (VPSR) suburb-level locality set — union across median_house, median_unit, median_land, Q4 2025

## Summary

| metric | value |
|---|---|
| total distinct VPSR localities | 785 |
| direct SAL mappings | 579 |
| alias mappings (ASGS disambiguation-suffix stripped) | 167 |
| correspondence-derived count | 0 |
| ambiguous count | 0 |
| unresolved count | 39 |
| duplicate mappings | 0 |
| cross-state contamination | 0 |
| mapping rate | 95% |

Per-file locality counts: {"detached_house":772,"apartment_unit":444,"residential_land":213}

## Method

1. Direct match: VPSR locality name vs `core.dim_geography.geography_name`
   (geography_type=SAL, state_code=2), case-insensitive, trimmed.
2. Alias match: strip ASGS's trailing state-disambiguation suffix (e.g.
   "Abbotsford (Vic.)" -> "Abbotsford") and retry: applied only when exactly
   one ASGS SAL candidate remains (0 ambiguous cases in this file set).
3. No fuzzy matching, no partial-string matching, no manual guesswork.

Full rule documentation: `warehouse/config/vic_locality_aliases.yml`.

## Key finding

VPSR (Victorian Property Sales Report) publishes at standard, single-suburb
locality grain — it does NOT use the multi-suburb custom groupings found in
Homes Victoria's rental report (e.g. "Albert Park-Middle Park-West St
Kilda"). This means VIC sales data can be safely loaded at suburb (SAL)
grain, matching NSW's own suburb-grain sales summaries, rather than falling
back to LGA grain. The LGA-grain fallback remains the plan for VIC rent
data (Phase 6), where the custom-grouping problem is real and unresolved.

## Unresolved localities (quarantined, not guessed)

39 localities have no ASGS SAL match after applying the
rules above. These are held out of the suburb-grain local store rather than
mapped to a guessed geography. Full list in
`warehouse/reports/victoria_unresolved_geographies.csv`.

Representative examples: ASCOT (GREATER BENDIGO), HILLSIDE (MELTON),
NEWTOWN (GREATER GEELONG) — VG-specific LGA-scoped disambiguators that do
not match ASGS's own disambiguation pattern; GARDEN CITY, WESTGARTH,
OSBORNE, SYNDAL — informal/historical locality names absorbed into
neighbouring official SAL boundaries under ASGS Ed.3; FISHERMANS BEND,
JOLIMONT — redevelopment precincts without a standalone SAL.

## Validation gates (Phase 4)

- Ambiguous mappings: 0 (target: reviewed, none silently resolved)
- Duplicate mappings: 0
- Cross-state contamination: 0
- Every published row will carry an explicit geography confidence label (direct / alias) once loaded in Phase 5
