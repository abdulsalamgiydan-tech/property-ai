# VIC Supply, Demographics, Affordability Report (Sprint 10, Phase 7)

Generated: 2026-07-21

## Method

Verified against already-loaded national data rather than performing new
ingestion. ABS ASGS geography, Census dwelling stock/tenure/demographics,
and Building Approvals were loaded as **national** datasets in Sprints 2-4
and 9 (not NSW-scoped) — confirmed by direct branch query, not assumed.

## Findings

| dataset | VIC rows | table |
|---|---|---|
| ASGS SAL geography | 2,944 | `core.dim_geography` (state_code='2') |
| Dwelling stock | 152,192 | `core.fact_dwelling_stock` |
| Household tenure | 114,144 | `core.fact_household_tenure` |
| Building approvals | 20,358 | `core.fact_building_approvals` |

All four corresponding marts (`suburb_dwelling_stock_2021`,
`postcode_dwelling_stock_2021`, `suburb_demographic_profile_2021`,
`postcode_demographic_profile_2021`, `suburb_building_approvals`,
`postcode_building_approvals`) already carry full VIC coverage.

`mart.national_interest_rate_context` (RBA rates) is national by
definition — no separate VIC sourcing needed or possible.

Demographics carry the same 2016/2021 ASGS boundary-mismatch limitation as
NSW (`population_2016` / `population_growth_2016_2021_pct` remain NULL
where the comparison isn't valid) — this is not a VIC-specific gap, it
applies identically to every state.

## Affordability methodology

`meta.metric_assumption` (scenario `standard_20pct_deposit_30yr_pi`) has no
jurisdiction or state column — NSW and VIC repayment/affordability
snapshots computed from it necessarily share the same deposit percentage
(20%), loan term (30 years), repayment type (principal & interest), rate
source (`mart.national_interest_rate_context`), and LMI treatment
(excluded). This is a structural property of the existing schema, verified
by direct query rather than re-implemented per state — no code change was
needed to guarantee identical methodology across NSW/VIC.

## Conclusion

No new local store, no new download, no Supabase write required for Phase
7. Victoria's supply/demographics/affordability data is already available
at full SAL/POA coverage; only the Phase 9 branch-load step needs to widen
existing snapshot-builder SQL from an NSW-only geography filter to include
VIC.
