# Sprint 11 Existing-State Audit (Workstream 1)

Generated: 2026-07-21

## Supabase capacity — corrected finding

The organization plan is **Pro** (verified via `get_organization`), which
includes **8 GB** of database storage before per-GB overage billing
begins. Prior sprints assumed a 4,500 MB safety ceiling without verifying
the actual plan-included allocation. The real "increases paid
infrastructure" threshold is **8,192 MB**, not 4,500 MB.

The 4,500 MB figure is kept as Sprint 11's working internal safety margin
(55% of the real ceiling) rather than loosened, since branch storage
autoscaling behaviour relative to the parent project was not independently
re-verified this pass.

Current branch size: **2,359 MB**.

## Schema and table sizes

| schema | size | % of DB |
|---|---|---|
| core | 1,888 MB | 80.1% |
| mart | 450 MB | 19.1% |
| meta | 760 kB | 0.03% |
| staging | 128 kB | 0.005% |

Largest tables: `core.dim_geography` (698 MB, national ASGS backbone),
`core.fact_dwelling_stock` (402 MB — index is *larger* than the table,
258 MB vs 144 MB, flagged for WS17 review), `core.fact_household_tenure`
(228 MB, same index-heavy pattern), `core.fact_residential_sales_summary`
(219 MB), `core.fact_rental_market_summary` (163 MB).

## Local storage (developer machine, not a Supabase concern)

`warehouse/data/` totals **9.3 GB** (1.8 GB local DuckDB stores, 6.0 GB
processed/extracted ASGS shapefiles, 1.5 GB raw downloads) — all
gitignored, confirmed via `npm run warehouse:check`.

Git repo itself: **6.2 MB** — confirms no raw/large file has ever entered
git history. Build output (`.next`): 1.2 GB, gitignored.

## Migrations

17 migrations exist, all additive (no destructive statements). Next
expected: `018`.

## Public interfaces (12 total)

7 views + 5 functions, spanning migrations 014 and 016.

## Query performance baseline (measured, not assumed)

| interface | execution time | target | result |
|---|---|---|---|
| `search_market_geographies_v2` (jurisdiction filter only) | 33.5 ms | 500 ms | PASS |
| `search_market_geographies_v2` (text query + filter) | 101.1 ms | 500 ms | PASS |
| `get_market_snapshot_v2` | 6.8 ms | 750 ms | PASS |
| `compare_market_geographies_v1` (3 geographies) | 7.9 ms | 1,500 ms | PASS |
| `get_market_timeseries_v2` | 4.0 ms | 1,500 ms | PASS |

All interfaces pass with wide margin. One finding: the ILIKE text-search
branch of `search_market_geographies_v2` does a bitmap heap scan filtering
~18k SAL/POA rows with no index accelerating the leading-wildcard pattern
match. This is currently fast enough because national SAL/POA row count is
small and stable (ASGS geography has been fully national since Sprint 2 —
adding more jurisdictions' *market data* won't grow this scan). Flagged as
a WS17 optimisation candidate (a `pg_trgm` GIN index would convert it to
an index scan), not an immediate blocker.

## Duplicate state-specific code

NSW's and VIC's snapshot-builder scripts share substantial CTE structure
but were deliberately not abstracted in Sprint 10, per the explicit
"refactor only where needed to support a second jurisdiction safely"
instruction. Recommendation: revisit once a **third** jurisdiction needs a
snapshot builder — three independent implementations is the point where
extracting a shared helper is justified by real duplication, not
speculative refactoring. No action taken this workstream.

## Data retention

No automated retention/expiry policy exists. This isn't currently a
problem: every branch load is an UPSERT keyed on a stable natural key, not
an append-only insert, so there's no growing duplicate-version
accumulation to solve. The one known over-retention case
(`mart.suburb_sales_monthly` holding full 1996-2026 history instead of the
originally intended trailing-12-months) remains from Sprint 9/10 — `DELETE`
is forbidden by the project's hard rules, so it stays a client-side
display-filter concern, not a database cleanup task.
