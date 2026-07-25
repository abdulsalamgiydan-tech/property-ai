# State Adapter Architecture (Sprint 10, Phase 2)

## Why this exists

Through Sprint 9, every NSW-specific script (`build_nsw_sales_full_state_local_store.mjs`,
`build_nsw_rents_full_state_local_store.mjs`, etc.) hardcoded NSW's official
sources, field layouts, and classification rules directly. Sprint 10 adds
Victoria without a second full rewrite by extracting the parts of that
pipeline that are genuinely **jurisdiction-specific** into a documented
contract, while leaving the parts that are **already jurisdiction-agnostic**
(geography backbone, confidence-labelling thresholds, provenance metadata
shape) untouched. Per this sprint's explicit instruction — *"Do not rewrite
working logic merely for aesthetics. Refactor only where needed to support a
second jurisdiction safely"* — this is a **documentation and contract-first**
refactor, not a rewrite of NSW's proven, already-tested ingestion scripts.

## What actually changes vs. what stays the same

| Layer | Sprint 9 (NSW-only) | Sprint 10 |
|---|---|---|
| Geography backbone | `core.dim_geography`, ASGS-wide | **Unchanged** — already national |
| Confidence thresholds (sample-size high/medium/low/insufficient) | Hardcoded per-script, identical numbers everywhere | **Unchanged logic**, now documented once in `warehouse/adapters/shared/confidence/` as the canonical rule so VIC reuses the exact same thresholds, not a redefinition |
| Provenance/lineage shape (`meta.source`/`dataset`/`load_run`/`source_file`) | Reused ad hoc per script | **Unchanged** — every adapter still writes through the same `meta.*` tables |
| Dwelling classification | NSW-specific rules in `nsw_dwelling_type_mapping.yml` | **New**: VIC gets its own `vic_dwelling_type_mapping.yml` under the same canonical dwelling-type vocabulary (`warehouse/docs/CANONICAL_PROPERTY_DATA_CONTRACTS.md`) — states never share raw source fields, but must share the same output vocabulary |
| Canonical transaction/rental shape | Implicit (NSW's own column names) | **New**: explicit typed contract (`warehouse/docs/CANONICAL_PROPERTY_DATA_CONTRACTS.md`) every adapter's local store must satisfy |
| Sales/rent scripts themselves | `warehouse/scripts/sales/*.mjs`, `warehouse/scripts/rents/*.mjs` | **Unchanged in place** — NOT moved into `warehouse/adapters/nsw/`. Moving 10+ already-tested, already-branch-proven NSW scripts purely for directory aesthetics risks breaking a working pipeline for no functional gain. Instead, `warehouse/adapters/nsw/` contains thin **adapter manifest** files that document how the existing scripts satisfy the canonical contract (source→script→contract mapping), and Victoria's genuinely new scripts live under `warehouse/adapters/vic/` directly. |

## Directory structure delivered

```
warehouse/
  adapters/
    shared/
      contracts/
        canonical_sales_transaction.md     -- points to CANONICAL_PROPERTY_DATA_CONTRACTS.md
        canonical_rental_summary.md
      confidence/
        sample_size_thresholds.md          -- the one true set of high/medium/low/insufficient cutoffs (>=30/>=10/>=5/<5), reused by every jurisdiction
      geography/
        asgs_backbone.md                   -- documents that core.dim_geography is already national; adapters query it, never re-create it
      classifications/
        dwelling_type_vocabulary.md        -- the shared canonical dwelling_type enum every state must map into
      provenance/
        lineage_shape.md                   -- documents the meta.source/dataset/load_run/source_file pattern every adapter must populate
      validation/
        blocking_gates.md                  -- the shared set of gate categories (duplicate keys, negative values, orphan geography, missing confidence label) every adapter's local validator must implement
    nsw/
      sales/adapter.md                     -- manifest: which existing scripts satisfy which contract sections, unchanged
      rents/adapter.md
      supply/adapter.md                    -- documents NSW supply/demographics/approvals as already-national, no NSW-specific script needed
    vic/
      sales/                               -- genuinely new Sprint 10 scripts
      rents/
      supply/adapter.md                    -- documents that VIC supply/demographics/approvals are ALSO already national (see sprint10_existing_state_audit.md) — no new script needed, same as NSW
```

## Adapter contract (every jurisdiction must satisfy)

1. **Source discovery** — a `discover_*.mjs` script that live-verifies the
   official source URL/product and writes a `*_source_manifest.{json,md}`.
2. **Download/access** — official government/statutory source only, no
   commercial portals, no bot-protection bypass.
3. **Raw parsing** — preserves every original source field; classification
   never overwrites raw fields, only adds new derived columns.
4. **Address/locality normalisation** — deterministic (case/punctuation),
   documented aliases only, no fuzzy matching without a confidence
   threshold and quarantine path for ambiguous cases.
5. **Transaction identity** — a stable natural key sufficient to detect true
   duplicates vs. legitimate re-sales/corrections.
6. **Geography mapping** — resolves to `core.dim_geography` SAL/POA rows
   (already national); never invents a geography relationship.
7. **Dwelling classification** — evidence-only, deterministic, documented
   per-jurisdiction mapping file, output constrained to the canonical
   `dwelling_type` vocabulary.
8. **Invalid/nominal transfer rules** — documented per-jurisdiction (source
   fields differ), same intent as NSW's price/nature-of-transfer flags.
9. **Outlier handling** — flagged, never deleted, documented method (NSW
   uses a 3xIQR rule per dwelling_type; VIC may reuse or document its own).
10. **Period aggregation** — monthly/quarterly/annual per the canonical
    contract's period_type vocabulary.
11. **Confidence assignment** — reuses the shared sample-size thresholds
    (`adapters/shared/confidence/sample_size_thresholds.md`) — never
    redefined per state.
12. **Provenance** — writes through the shared `meta.*` lineage tables.
13. **Local validation** — a `validate_*.mjs` script enforcing the shared
    blocking-gate categories plus any jurisdiction-specific checks.
14. **Branch mart generation** — curated, confidence-labelled summaries
    only; full transaction-level detail never leaves the local store.
15. **Freshness metadata** — every load records its source period and
    retrieval timestamp for the Phase 13/14 refresh/observability layer.

## Contract tests

`lib/warehouse/adapterContract.test.ts` (added this sprint) asserts NSW's
already-branch-resident output still satisfies the canonical contract's
shape/vocabulary after this refactor — proving the refactor was
documentation-only and did not change NSW's actual behaviour. See
`warehouse/docs/CANONICAL_PROPERTY_DATA_CONTRACTS.md` for the exact typed
shapes being asserted.
