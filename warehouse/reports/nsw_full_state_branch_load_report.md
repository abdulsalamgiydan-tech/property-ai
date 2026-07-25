# NSW Full-State Sales + Rent Branch Load Report (Sprint 7, Part C)

Generated: 2026-07-20 (run details: `nsw_full_state_branch_load_report.json`)
Source: local DuckDB stores `nsw_sales.duckdb` and `nsw_rents.duckdb` (both validated
PASSED), curated summaries only.
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production touched: NO** (zero warehouse schemas on `oshquaxsloolqucwvigc`,
re-verified after commit via independent MCP query). **Frontend changed: NO.**
**Raw transactions/rent sheets loaded to branch: NO** — full local detail (5.2M raw
sales records, 304,771 raw rent sheet rows) stays in the local DuckDB stores only.

## Scope expansion (vs Sprint 5/6 pilot)

- Sales: 6 pilot LGAs → all 129 NSW LGAs / 4,542 SALs / 2,641 POAs; 2021-current →
  2001-current (2019 and 2001-2014 use a different flat-zip PSI vintage format,
  handled explicitly in the local-store builder).
- Rent: 6 pilot LGAs → all NSW LGAs/postcodes available from the DCJ Rent and Sales
  Report (same already-downloaded quarterly source files, pilot allow-list removed).

## Capacity policy applied

Full monthly sales history stays **local only**; only the **trailing 12 months** of
monthly sales grain is promoted to the branch. Annual sales, and rent/yield at
quarterly grain, are promoted **in full** (compact enough for branch capacity).
Branch DB size was monitored before/during/after against `MAX_SAFE_DB_MB=4500`.

| | before | after |
|---|---|---|
| branch DB size | 2,049 MB (already contained pilot data from Sprints 5/6 plus in-progress full-state attempts) | 2,049 MB |

The size figure did not change on the final successful run because the actual data
load had already committed on a prior attempt (`bkfdl3l8e`); this run re-attempted
the same inserts, all of which safely no-op via `ON CONFLICT DO NOTHING` (idempotent
re-run to regenerate the reports only — see Known issues below).

## Loaded (branch core + mart) — final state, independently re-verified via MCP

| table | rows | notes |
|---|---|---|
| `core.fact_residential_sales_summary` | 265,528 | 196,019 annual (2001-current) + 43,941 trailing-12-month rows loaded from a 196,019+43,941-row pre-read; 0 orphans skipped |
| `core.fact_rental_market_summary` | 257,940 | all NSW quarters; 0 orphans skipped |
| `mart.suburb_sales_monthly` | 49,191 | trailing 12 months only |
| `mart.suburb_sales_annual` | 154,118 | full 2001-current history |
| `mart.postcode_sales_monthly` | 20,224 | trailing 12 months only |
| `mart.postcode_sales_annual` | 41,995 | full 2001-current history |
| `mart.suburb_rent_quarterly` | 21,359 | derived via POA→SAL correspondence chain (DCJ never publishes at SAL grain) |
| `mart.postcode_rent_quarterly` | 42,152 | direct from DCJ postcode grain |
| `mart.suburb_yield_quarterly` | 21,359 | |
| `mart.postcode_yield_quarterly` | 20,583 | |

## Blocking gates (in-transaction, re-verified independently via MCP after commit)

Duplicate fact grain **0** (sales and rent) · NULL `geography_id` **0** · negative
median price/rent **0** · orphan geography ids **0** · yield rows missing a
confidence label **0** · duplicate yield grain **0**.

## Sample-size confidence distribution

**Sales** (`core.fact_residential_sales_summary`): high 60,661 · medium 44,543 ·
low 38,638 · insufficient 121,686.

**Rent** (`core.fact_rental_market_summary`): high 44,061 · insufficient 213,879
(rent confidence is binary — DCJ only publishes a cell when its own new-bonds
sample threshold is met, otherwise the row is a `Total`-only aggregate treated as
`insufficient` for the fine-grained bedroom/dwelling-type split).

## Known issues resolved during this load

Three loader bugs were found and fixed across four run attempts (`b4k1ghz52` →
`b4no2qt45` → `bkfdl3l8e` → `bq2nrh6v4`): a Postgres/DuckDB `interval` syntax
mismatch, a NULL-distinctness bug in the rent fact table's unique constraint that
could have silently let duplicate "Total" rent rows through `ON CONFLICT DO NOTHING`
(caught by the blocking gate, not committed — see migration
`010_fact_rental_market_summary_null_bedroom_fix.sql`), and a post-commit reporting
query referencing a non-existent column (`sample_size_confidence` instead of
`confidence_label` on the rent fact table) — this last bug surfaced only *after* a
fully successful, already-committed transaction, so the fix was verified safe to
re-run (all inserts idempotently no-op) purely to regenerate this report correctly.

## Next step

Sprint 7 delivers full NSW coverage for sales (2001-current) and rent/yield (DCJ's
full published history) at suburb and postcode grain. Remaining open items: RLS on
warehouse schemas still undecided before anything approaches production; the
1990-2000 PSI archive remains explicitly out of scope per the task; dwelling-type
coverage for yield remains limited to types present on both the sales and rent
sides (see `nsw_full_state_yield_report.md`).
