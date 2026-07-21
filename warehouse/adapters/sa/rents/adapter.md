# SA rents adapter (Sprint 11, Workstream 6)

| contract section | script |
|---|---|
| Download (all 71 quarters) | `warehouse/scripts/rents/download_sa_rents.mjs` |
| Local build (current era, 7 quarters) | `warehouse/scripts/rents/build_sa_rents_local_store.mjs` |
| Local validation | `warehouse/scripts/rents/validate_sa_rents_local_store.mjs` |
| Branch mart generation | not yet built — deferred to Workstream 9 |

Official source: SA Housing Trust Private Rent Report, suburb/postcode
grain. Only the current-format era (2024-09..2026-03) is parsed; see
`warehouse/docs/SA_DATA_METHOD.md` for the full method, format-drift
history, and known gaps.
