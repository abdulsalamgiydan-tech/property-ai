# Western Australia Source Manifest (Sprint 11, Workstream 2)

Generated: 2026-07-21

| | Rent | Sales |
|---|---|---|
| Publisher | WA Dept. of Mines, Industry Regulation and Safety | Landgate |
| Product | WA Rental Bonds Data | Property sales reports |
| Status | **selected_free_automatable_with_caveat** | **paid_official** |
| Access | Direct download, CC BY 4.0, no bot protection | Per-report paid order |
| Grain | Postcode, RAW individual bond records | Transaction-level, paid only |
| History | 2023-current (monthly) | Back to 1988 but paid-only |
| Format | CSV in monthly ZIP | N/A |

Full field-level detail: `western_australia_source_manifest.json`.

**Bottom line**: WA rent is free (CC BY 4.0) but structurally different
from every other state's source in this sprint — it's raw individual bond
lodgement/disposal records, not a pre-computed median. Building this
adapter requires genuine median-computation logic (grouping lodgements by
postcode/period and applying this project's existing sample-size
confidence thresholds), a materially larger task than reading a
source-provided aggregate. WA sales has no free bulk product; the free
catalogue metadata that does exist carries a "Personal Use License" not
clearly compatible with this platform's use case — flagged as
`licence_unclear`-adjacent rather than assumed permissible.
