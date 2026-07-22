# Sprint 12 Capacity Plan

## Starting position (measured live, `warehouse-validation` / `lzonauinzatmtytyoems`)

Total branch size: **2,634.1 MB**, against this project's internal working
ceiling of **4,500 MB** (the branch's actual Supabase Pro allocation is
8,192 MB; 4,500 MB is the deliberately conservative internal number this
project has held itself to since Sprint 11). That's **58.5%** of the
ceiling used at Sprint 12's start.

| schema | MB | tables | role |
|---|---|---|---|
| `core` | 2,120.8 | 10 | raw/fact layer — geometry-heavy (`dim_geography` alone is 698.4 MB) and full-detail national facts |
| `mart` | 492.0 | 22 | curated, query-ready marts — the layer the public API/UI actually reads |
| `meta` | 0.7 | 12 | lineage/registry/quality metadata — tiny, will grow with WS8/WS9 but stays small by design |
| `public` | 0.1 | 7 | views/functions — near-zero, this is the public-facing surface |
| `staging` | 0.1 | 3 | transient load staging — near-zero by design (never accumulates) |

Top individual tables: `core.dim_geography` (698.4 MB, national ASGS
geometry across all 9 levels), `core.fact_dwelling_stock` (402.5 MB),
`core.fact_rental_market_summary` (396.1 MB), `core.fact_household_tenure`
(228.0 MB), `core.fact_residential_sales_summary` (218.7 MB).

## Sprint 12 budget

**Target: stay below 75% of the 4,500 MB ceiling = 3,375 MB.**

Remaining budget from the 2,634.1 MB starting point: **740.9 MB**.

This is a real constraint, not a formality — Sprint 12 adds 3 new
jurisdictions (TAS/ACT/NT), a 2016 boundary version (a second full national
geometry layer if handled naively), a research-publication catalogue, a
data-lineage system, and a data-quality-monitoring system. None of these
can be allowed to promote raw/detailed data to the branch by default.

## Design rules for Sprint 12 (enforced, not aspirational)

1. **`core` schema growth is the primary risk.** The existing `core`
   schema is already 2,120.8 MB (80.5% of everything on the branch). Any
   new jurisdiction's detailed facts (TAS/ACT/NT sales/rent observations,
   if transaction-level data exists at all) load to **local DuckDB/Parquet
   first**, and only curated, aggregated marts get promoted — the same
   local-first pattern established for NSW/VIC/QLD/SA/WA.

2. **2016 boundaries (WS4) never get their own full `core.dim_geography`
   duplicate on the branch.** The 2016 ASGS geometry set is only needed
   locally, to compute the correspondence weights between 2016 and 2021
   geography editions. What gets promoted is the **correspondence table**
   (codes + weights + confidence, no geometry), not a second national
   geometry layer. A naive duplicate of `core.dim_geography` would cost
   another ~700 MB — unaffordable within this budget and unnecessary,
   since only 2021 geometry is ever rendered.

3. **Research publications (WS5) are metadata rows, not documents.**
   `meta.research_publication`/`research_claim`/`research_dataset_reference`
   store title/URL/date/paraphrase-length text only — no PDFs, no scraped
   full-text, no images. This stays in the `meta` schema's existing
   near-zero footprint.

4. **Lineage (WS8) and data-quality (WS9) tables are metadata about
   metadata** — one row per load-run/quality-check/transformation, not
   per-observation. Sized like the existing `meta.dataset_refresh_run`
   (tiny), not like a fact table.

5. **National canonical marts (WS6)** replace/consolidate rather than
   duplicate — where a snapshot mart already exists per jurisdiction
   (e.g. `mart.suburb_market_snapshot` already spans NSW/VIC), extending
   it to cover TAS/ACT/NT is additive rows to an existing table, not a new
   per-jurisdiction table. Explicitly matches the mission's "no duplicated
   national facts per jurisdiction" rule.

## Pre-flight gate (already enforced in code, re-confirmed for Sprint 12)

`refresh_engine_v2.mjs`'s capacity check (queries `pg_database_size`
before any `--branch-load`, refuses at ≥90% of the 4,500 MB ceiling) stays
in force unchanged. Sprint 12's own internal target (75%) is stricter than
that hard code-level gate (90%) — the 75% figure is this sprint's
self-imposed budget for *planning* purposes; the 90% figure remains the
absolute code-enforced refusal point. If Sprint 12's work approaches 75%
before all workstreams are done, the response is documented in-line with
WS15's explicit design decision: **stop promoting detailed facts, keep
them local, promote only necessary marts** — not increase the ceiling.

## What is explicitly local-only in Sprint 12 (never promoted)

- Raw TAS/ACT/NT source files (whatever bulk downloads/API responses are
  obtained)
- 2016 ASGS boundary geometry (used only to compute correspondence
  weights)
- Any wide/detailed Census tables beyond what specific marts need
  (matches the standing rule from Sprint 11's Part B3: "avoid loading
  unnecessarily wide Census tables, keep detailed data local")
- Full text of any research publication (only metadata + short
  paraphrases are stored)
- Per-observation quality-check evidence beyond what a `meta.data_quality_result`
  row needs to explain a failure
