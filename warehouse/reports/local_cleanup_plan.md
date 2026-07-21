# Local Cleanup Plan (Sprint 11, Workstream 7)

Generated: 2026-07-21T20:25:46.051Z

**This is a plan only — nothing is deleted by this script or by running it.**

Based on audit: 2026-07-21T20:25:18.941Z

## Safe-to-delete candidates (raw/ source still present on disk)

| dataset | size (MB) | files |
|---|---|---|
| census | 3068.14 | 645 |
| nsw_sales | 1487.89 | 148072 |
| asgs | 1197.09 | 105 |
| census_2016 | 621.43 | 240 |

**Total reclaimable: 6374.55 MB**

### Commands (review before running — not executed by this script)

```bash
rm -rf "warehouse/data/processed/census"
rm -rf "warehouse/data/processed/nsw_sales"
rm -rf "warehouse/data/processed/asgs"
rm -rf "warehouse/data/processed/census_2016"
```

## Needs manual review (no matching raw/ dataset found on disk)

(none)

## Caveats

- A dataset is only proposed for deletion if its raw/ source still exists on disk — re-extraction is then possible without re-downloading anything.
- This plan does not verify that every processed file was actually consumed into a local/ build (e.g. an abandoned or half-finished build could leave processed/ as the only evidence of a problem) — review warehouse/reports/*_local_build.json or *_report.json for each dataset before running any rm command.
- Nothing in this script is ever executed automatically. A human (or a future session with explicit instruction) must run the listed commands manually.
