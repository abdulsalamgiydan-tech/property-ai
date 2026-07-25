# South Australia Source Manifest (Sprint 11, Workstream 2)

Generated: 2026-07-21

| | Rent | Sales |
|---|---|---|
| Publisher | SA Housing Trust (via CBS bond data) | Land Services SA |
| Product | Private Rent Report | SAILIS / Property Edge |
| Status | **selected_free_automatable** | **paid_or_restricted** |
| Access | CKAN API + direct download, no bot protection | Purchase via SAILIS/Property Edge account |
| Grain | Suburb/postcode/region/SLA, quarterly | Not applicable — no free bulk product |
| History | 2008-current (72 quarterly files) | N/A |
| Format | xlsx, CC BY | N/A |

Full field-level detail: `south_australia_source_manifest.json`.

**Bottom line**: SA rent is an excellent free source with the deepest
verified history of any state checked this sprint (18 years, back to
2008). The CKAN API pattern mirrors VIC's own discovery mechanism from
Sprint 10, making this straightforward to automate. SA sales has no free
bulk aggregate; documented as a coverage gap.

**Note**: the "SLA" (Statistical Local Area) geography level used by this
source predates the current ASGS standard (superseded by SA2 in ASGS
2011+) — mapping it will need its own correspondence work, separate from
this sprint's 2016-2021 Census harmonisation (Workstream 4), if SLA-grain
data is ever promoted.
