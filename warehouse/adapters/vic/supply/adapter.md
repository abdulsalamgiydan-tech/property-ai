# VIC supply/demographics adapter (already national — no new script needed)

Confirmed by direct query (`sprint10_existing_state_audit.json`): Victoria
already has 2,944 SAL rows in `mart.suburb_demographic_profile_2021`,
`mart.suburb_dwelling_stock_2021`, and `mart.suburb_building_approvals` —
all populated by the same national ABS loads used for NSW (Sprints 3, 4, 9).
No new download, local build, or branch load is required for Victoria
supply/demographics/dwelling-stock data this sprint — only the unified
snapshot-builder SQL needs to include Victoria geographies when joining
these already-present facts.
