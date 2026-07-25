# Census Demographics Source Manifest (Sprint 9, Phase 1)

Generated: 2026-07-21 (full detail: `census_demographics_source_manifest.json`)

## Reuse, not re-download

The three official ABS DataPack ZIPs this phase needs (2021 GCP SAL and POA "for AUS,
short-header") were already downloaded and hash-verified in **Sprint 3** and remain on
disk at `warehouse/data/raw/census/2021/datapacks/`. Sprint 3 only parsed tables G36
(dwelling structure) and G37 (tenure) from these files. This phase extracts three
**additional** tables — G01, G02, G35 — from the same already-verified official files.

## Official tables used (verified against the DataPack's own Metadata workbook)

| table | official name | measures used |
|---|---|---|
| G01 | Selected Person Characteristics by Sex | total population (`Tot_P_P`) |
| G02 | Selected Medians and Averages | median age, median household/personal/family weekly income, average household size, census median rent/mortgage (kept separate from the DCJ/RBA-based figures elsewhere in the warehouse) |
| G35 | Household Composition by Number of Persons Usually Resident | total households, family households, lone-person households |

G36 (Dwelling Structure) and G37 (Tenure) are **already loaded** on the branch from
Sprint 3 (`core.fact_dwelling_stock`, `core.fact_household_tenure`) — reused via SQL join
at mart-build time, not re-extracted.

## Direct, not derived

SAL and POA are **native** geography levels for every GCP DataPack table, including G02's
medians. Unlike Sprint 2-4's SA1-correspondence-weighted marts, this dataset needs no
correspondence weighting at all — every row is `direct_or_derived='direct'`. This matters
particularly for medians: a median cannot be validly re-derived from a finer geography via
weighted aggregation, so reading it directly from the native SAL/POA file is the only
correct approach.

## Explicitly deferred: population_2016 / population_growth_2016_2021_pct

2016 Census SAL/POA boundaries (ASGS Edition 1) do not align 1:1 with the 2021 boundaries
(ASGS Edition 3) already in `core.dim_geography`. Producing a valid `population_2016`
figure on today's geography backbone would need a full 2016→2021 SA1-level boundary
correspondence exercise — comparable in scope to its own mini-sprint. Per this sprint's
explicit "where directly supportable" hedge and its "do not invent geography
relationships" rule, these two fields are left **NULL** for every row, with a documented
reason, rather than approximated across mismatched boundaries.

## Licence

CC BY 4.0, attribute the ABS.
