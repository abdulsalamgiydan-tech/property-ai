# Sprint 11 Workstream 9 — QLD/SA/WA Rent Branch Promotion

Generated: 2026-07-22

## What this sub-pass covers

The first WS9 sub-pass: promoting the three rent local stores built and
validated in Workstream 6 (QLD, SA, WA) onto the `warehouse-validation`
branch, using entirely existing schema (`core.fact_rental_market_summary`,
already shared safely by NSW's POA rows) plus one small additive migration
for a mart table that should have existed already.

## Migration 018 — `mart.lga_rent_quarterly`

Mirrors `mart.suburb_rent_quarterly` / `mart.postcode_rent_quarterly`
exactly (same columns, same unique constraint, same index shape).
Applied to the branch and verified live (`to_regclass` confirms the table
exists).

## An unexpected, corrected finding

While building this migration, the working assumption was that
`core.fact_rental_market_summary`'s existing 48,024 LGA-grain rows came
from VIC's Homes Victoria data (Sprint 10). **This was checked and found
wrong before finalising anything**: those 48,024 rows are actually **NSW
DCJ's own LGA-grain rent data, loaded in Sprint 6** — dormant and
unqueryable ever since, because no LGA-grain mart view existed until this
migration. VIC has **zero rows** in `core.fact_rental_market_summary` at
all; its rent data lives entirely in `mart.suburb_market_snapshot` via a
separate Sprint 10 pipeline. The migration comment, table comment (on the
live branch table), and this report all reflect the corrected finding —
not the initial wrong assumption.

## Branch load — `load_qld_sa_wa_rents_to_branch.mjs`

Loaded all three local stores' resolved rows (`geography_confidence in
('direct','alias')` — unresolved rows are never promoted) into
`core.fact_rental_market_summary`, then extended the three rent marts with
each jurisdiction's "Total across bedrooms" rows
(`bedroom_count IS NULL`), matching the existing mart tables' unique
constraint and the exact convention already used for NSW.

Found and fixed one real bug before this ran clean: a spread-over-large-
array stack overflow identical to the one hit in Workstream 7's storage
audit (400k+ rows via `array.push(...bigArray)` exceeds V8's argument
limit) — fixed with an explicit loop. Also found the transaction's first
attempt failed on a unique-constraint collision because
`core.fact_rental_market_summary` has a second, expression-based unique
index (`coalesce(bedroom_count, -1)`, added in migration 010 to fix NULL
not colliding with NULL) that the `ON CONFLICT` clause didn't originally
target — fixed by matching the exact expression.

### Results

| table | rows before | rows after | delta |
|---|---|---|---|
| `core.fact_rental_market_summary` | 257,940 | 660,911 | +402,971 |
| `mart.suburb_rent_quarterly` | 21,359 | 99,561 | +78,202 |
| `mart.postcode_rent_quarterly` | 42,152 | 75,578 | +33,426 |
| `mart.lga_rent_quarterly` | 0 | 13,931 | +13,931 (new) |

By jurisdiction (fact-layer rows, all grains):

| jurisdiction | SAL | LGA | POA |
|---|---|---|---|
| QLD | 187,952 | 23,345 | 123,088 |
| SA | 27,798 | — (no LGA source) | 12,752 |
| WA | 19,794 | — (no LGA source) | 8,242 |

198 of 406,139 pre-read rows (0.05%) were skipped as orphans (geography
code not found in `core.dim_geography` for the current boundary version)
— a negligible residual, not investigated further at this scale.

Post-load blocking gates: 0 duplicate grain, 0 null geography IDs, 0
negative rents, 0 orphan facts remaining, 0 duplicate mart rows. Committed
in one transaction.

Branch DB size: 2,629 MB (was 2,359 MB before this session) — comfortably
under the 4,500 MB internal working ceiling and the 8,192 MB actual plan
limit.

## What's still NOT done

- **Yield marts** (`mart.suburb_yield_quarterly` etc.) are not extended
  for QLD/SA/WA — none of these three jurisdictions has any sales data
  loaded (Workstream 2's finding: no free bulk sales source exists for
  any of them), so gross yield cannot be computed regardless.
- **`mart.suburb_market_snapshot` / `mart.postcode_market_snapshot`**
  (the wide per-geography snapshot tables) are not extended with
  QLD/SA/WA rows this pass — that requires replicating the fuller
  snapshot-assembly logic already used for NSW/VIC (combining rent with
  demographics/supply/affordability into one wide row), a separate,
  larger piece of work.
- **NSW's 1990-2000 sales archive** (Workstream 8) is not yet promoted —
  still queued behind this sub-pass.
- **SA2/LGA-grain Census marts** (`sa2_dwelling_stock_2021`,
  `lga_demographic_profile_2021`, etc.) are not built — a genuinely
  promising discovery for a future sub-pass is that
  `core.fact_dwelling_stock` and `core.fact_household_tenure` **already
  contain real SA2 and LGA rows** (loaded natively from the same ABS
  Census GCP DataPacks already used for SAL, in an earlier sprint) — no
  new data load would be needed, only new mart views mirroring the
  existing `suburb_dwelling_stock_2021` pattern.
