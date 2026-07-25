# WA rents adapter (Sprint 11, Workstream 6)

| contract section | script |
|---|---|
| Local build (in-house median from raw lodgements) | `warehouse/scripts/rents/build_wa_rents_local_store.mjs` |
| Local validation | `warehouse/scripts/rents/validate_wa_rents_local_store.mjs` |
| Branch mart generation | not yet built — deferred to Workstream 9 |

Official source: WA DMIRS Rental Bonds Data (raw lodgements, no
pre-computed aggregate), suburb/postcode grain, medians computed in-house.
See `warehouse/docs/WA_DATA_METHOD.md` for full method and known gaps.
