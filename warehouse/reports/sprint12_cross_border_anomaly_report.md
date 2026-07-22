# Cross-Border Postcode Sales Attribution Anomaly — Investigation Report

## What was found

`mart.postcode_market_snapshot` has 16 rows (as of the latest quality run)
where a postcode's Australia-Post-range-heuristic jurisdiction contradicts
the jurisdiction implied by its `metric_provenance.sales_source` value.
Every single case involves `sales_source = 'nsw_vg_sales'` appearing under
a QLD-range or ACT-range postcode. First surfaced by WS8's manual
investigation (5 postcodes sampled by hand); WS9 built the
`cross_border_geography_join` quality rule, which checks every postcode
systematically and found all 16.

## Two distinct sub-patterns, deliberately not conflated

### Pattern A — QLD-range postcodes (e.g. 4375, 4377, 4380, 4382, 4383)

These are real Queensland towns on or near the NSW border (4380 is
Goondiwindi). Sale volumes are tiny (1-5 transactions per postcode).
**Plausible explanation**: Australian postal delivery catchments do not
always follow state/territory boundaries exactly — a NSW rural property
near a border town can legitimately be assigned a QLD-numbered postcode
for postal delivery purposes, independent of which state's land title
registry it belongs to. Under this explanation, `nsw_vg_sales` genuinely
sold a NSW property whose postal address happens to carry a QLD-range
postcode — not a data-quality defect at all.

### Pattern B — ACT-range postcodes (e.g. 2611, 2612, 2618)

These are firmly inside central Canberra (2611 covers Duffy/Chapman/
Rivett; 2612 covers Ainslie/Braddon-adjacent suburbs) — not plausible
border-catchment towns the way Pattern A's QLD postcodes are. Volumes are
similarly tiny (1-4 transactions per postcode). **This pattern is more
likely a genuine, small-scale data-quality issue** in the underlying NSW
VG sales geography-matching join — for example, a handful of records
whose postcode field was mis-keyed or mismatched during the original
Sprint 7 NSW full-state sales load.

## Why this was not "resolved" this sprint

Distinguishing Pattern A from Pattern B with certainty would require
either (a) the actual street address of each of the ~16-30 affected
transaction records (not present in the aggregated `core.fact_residential_sales_summary`
grain this warehouse operates at), or (b) authoritative Australia Post
postcode-to-locality reference data cross-checked against the NSW VG
source's original raw files — neither was available or in scope for a
targeted quality-rule build. Fabricating a resolution without this
evidence would violate this project's core rule: never guess, never
silently force a mapping.

## What was done instead (the responsible action)

1. **Registered as exactly what is verifiably true** in
   `meta.metric_lineage_registry`: two rows,
   `(postcode_market_snapshot, sales, QLD)` and
   `(postcode_market_snapshot, sales, ACT)`, both
   `source_id='nsw_vg_sales'`, `transformation_method=
   'cross_border_postcode_attribution_unresolved'`, with the Pattern A/B
   distinction documented directly in the `notes` field.
2. **Built a standing, automated detection rule**
   (`cross_border_geography_join` in `warehouse/scripts/quality/rule_engine.mjs`)
   that runs on every quality check, registered `advisory` (not
   blocking — the underlying data is real, sourced, small-volume, and
   documented; it does not warrant blocking promotion) but always visible
   via `meta.data_incident`, so this does not silently disappear from view
   the way a one-time manual finding would.
3. **Left the underlying `core.fact_residential_sales_summary` and mart
   rows completely untouched** — no deletion, no reassignment, no
   fabricated "fix." The postcode-range heuristic itself
   (`warehouse/scripts/lib/postcode_to_state.mjs`) is working exactly as
   designed; it correctly returns a jurisdiction guess for these
   postcodes, and this rule correctly flags when that guess conflicts
   with better evidence (the row's own recorded source).

## Recommended next step (not undertaken this sprint)

A future workstream with access to street-level NSW VG source records (or
an authoritative postcode-to-locality crosswalk) could resolve Pattern B
specifically — Pattern A likely never needs "resolving" at all, since it
may simply be correct.
