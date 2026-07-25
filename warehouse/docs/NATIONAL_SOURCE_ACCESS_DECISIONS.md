# National Source Access Decisions (Sprint 11, Workstream 2)

Governs how this sprint decided what to onboard, defer, or document as
blocked across the 6 remaining Australian jurisdictions. Full evidence:
`warehouse/reports/national_jurisdiction_source_manifest.{json,md}` and
the 6 per-jurisdiction manifests.

## Decision framework

A source is **selected_free_automatable** only when this sprint directly
verified (not assumed from a search snippet): a genuine, downloadable
file (not an HTML error/challenge page); an explicit or default-assumed
reuse-permitting licence; and no bot protection requiring anything beyond
this project's established headed-browser technique.

A source is **paid_official** or **paid_or_restricted** when the
publisher's own materials describe fee-based, per-property, or
account-purchase access, with no free bulk aggregate alternative found.

A source is **blocked_access** when the relevant official portal was
searched directly and returned zero relevant results, or no official
government/statutory-authority publisher could be identified at all.

Industry associations (REIV, REINT, and equivalents) are **always
rejected**, regardless of data quality, per this project's
official-sources-only rule — established for VIC in Sprint 10, applied
identically to NT in this sprint.

## Decisions by jurisdiction

### Queensland — proceed with rent, document sales gap

RTA Quarterly Data is selected for onboarding in Workstream 6 (highest
priority jurisdiction). Sales remain undocumented pending either a future
paid-data-licensing decision (out of scope this sprint, requires human
approval) or the emergence of a free QLD aggregate product.

### South Australia — proceed with rent, document sales gap

SA Housing Trust's Private Rent Report is selected, with the deepest
verified history of any jurisdiction discovered this sprint (2008-2026).
Sales remain undocumented — Land Services SA's SAILIS/Property Edge is a
commercial purchase product.

### Western Australia — proceed with rent (with extra adapter work), document sales gap

WA Rental Bonds Data is free (CC BY 4.0) but is raw lodgement-level data
requiring genuine median-computation logic in the adapter — a materially
larger build than QLD/SA/VIC's pre-aggregated sources. This sprint selects
it for onboarding but flags the extra engineering cost explicitly. WA
sales has no free bulk product, and even the free catalogue metadata
carries a licence (`Personal Use License`) that is not clearly compatible
with this platform's intended use — treated as a licence concern requiring
human review before any future reconsideration, not silently proceeded
past.

### Tasmania — defer, incomplete verification

Both categories received only search-level verification this sprint, not
a live download/inspection pass. Tasmania's Valuer-General sales product
appears fee-based; no rent source was identified, though Consumer,
Building and Occupational Services Tasmania was not directly checked.
**Decision: defer Tasmania's adapter work until a follow-up verification
pass completes**, rather than build against an unconfirmed source or
falsely declare the state fully blocked.

### ACT — document as blocked, proceed with national context only

Both categories were live-verified as returning zero results on the
official ACT open data portal. ACT's leasehold land tenure system may
mean sales data exists in a structurally different form not surfaced by a
standard keyword search — noted as a possible avenue for a future sprint,
not pursued further this pass. **Decision: ACT gets national ABS/RBA
context only this sprint; no state-specific sales or rent adapter is
built.**

### Northern Territory — document as blocked, proceed with national context only

The NT Government's own open data portal was checked completely (all 12
property-group datasets reviewed by name) and confirmed to have no sales
or rent data. REINT was explicitly rejected as an industry association.
**Decision: NT gets national ABS/RBA context only this sprint; no
state-specific sales or rent adapter is built.**

## Summary table

| jurisdiction | sales | rent | Sprint 11 build decision |
|---|---|---|---|
| QLD | paid_official | free | build rent adapter |
| SA | paid_or_restricted | free | build rent adapter |
| WA | paid_official | free (raw, extra work) | build rent adapter |
| TAS | paid_or_restricted (unverified) | unknown (unverified) | defer — re-verify first |
| ACT | blocked | blocked | national context only |
| NT | blocked | blocked | national context only |

This table directly feeds `warehouse/config/jurisdiction_coverage.yml`
(Workstream 3) and the Workstream 6 adapter priority order.
