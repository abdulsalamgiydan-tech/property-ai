# NSW supply/demographics adapter (already national — manifest only)

Building approvals (`core.fact_building_approvals`, via the national ABS
Data API `BA_SA2`), Census dwelling stock/tenure (`core.fact_dwelling_stock`,
`core.fact_household_tenure`), and Census demographics
(`mart.suburb_demographic_profile_2021`) were all loaded as **national**
datasets in Sprints 3, 4, and 9 — there is no NSW-specific supply/demographics
script, and no VIC-specific one is needed either (see
`warehouse/adapters/vic/supply/adapter.md`).
