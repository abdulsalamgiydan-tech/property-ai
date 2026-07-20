# NSW sales adapter (unchanged — manifest only)

Satisfies the canonical sales transaction contract via the existing,
already-branch-proven scripts (not moved or renamed this sprint):

| contract section | existing script |
|---|---|
| Source discovery | `warehouse/scripts/sales/discover_nsw_sales_sources.mjs` |
| Local build (download, parse, classify, aggregate) | `warehouse/scripts/sales/build_nsw_sales_full_state_local_store.mjs` |
| Reclassification (Sprint 9/10 correction) | `warehouse/scripts/sales/reclassify_nsw_dwelling_types.mjs` |
| Local validation | `warehouse/scripts/sales/validate_nsw_sales_full_state_local_store.mjs` |
| Branch mart generation | `warehouse/scripts/sales/load_nsw_full_state_to_branch.mjs`, `warehouse/scripts/sales/reconcile_nsw_sales_branch.mjs` (Sprint 10) |
| Dwelling classification rules | `warehouse/config/nsw_dwelling_type_mapping.yml` |

Official source: NSW Valuer General Property Sales Information (PSI).
Natural key: `district_code` + `property_id` + `sale_counter` + `contract_date`.
