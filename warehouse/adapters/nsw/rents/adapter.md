# NSW rents adapter (unchanged — manifest only)

| contract section | existing script |
|---|---|
| Source discovery | `warehouse/scripts/rents/discover_nsw_rent_sources.mjs` |
| Local build | `warehouse/scripts/rents/build_nsw_rents_full_state_local_store.mjs` |
| Local validation | `warehouse/scripts/rents/validate_nsw_rents_full_state_local_store.mjs` |
| Branch mart generation | `warehouse/scripts/sales/load_nsw_full_state_to_branch.mjs` (combined loader) |

Official source: NSW DCJ Rent and Sales Report (quarterly, LGA/postcode
grain; suburb/SAL derived via POA→SAL correspondence — `direct_or_derived`
labelled accordingly).
