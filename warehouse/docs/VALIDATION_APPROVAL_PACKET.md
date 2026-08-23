# Validation Approval Packet — SA metropolitan house-price batch (Official Coverage Uplift 1.1)

**Status: PREPARED — NOT APPROVED, NOT EXECUTED.** This packet describes a
disposable-branch-only validation load. Nothing here runs until a human approves
it and supplies the disposable-branch connection string. No Production reference,
no deploy, no environment change, no migration application is authorised by this
document.

Primary candidate: the **SA Metropolitan Median House Sales** batch proven offline
in `warehouse/reports/sa_metro_house_coverage_uplift.{json,md}`. (The earlier
WA weekly-context candidate is not a price/rent source and is not proposed for any
load — see `national_source_matrix.json`, disposition `accepted_official_context_only`.)

## 1. Candidate source & immutable identity

| Field | Value |
|---|---|
| Source id | `sa_metro_median_house_sales` |
| Dataset | Metropolitan Median House Sales — Q2 2026 (Government of South Australia) |
| Licence / attribution | CC BY 4.0 / © Government of South Australia (CC BY 4.0) |
| Resource SHA-256 | `9cfa8aa71d2c453c09ca1d3baecc1955144863cfb5c4caef01c12266e639ef7a` |
| Schema fingerprint | `6297926bf4b8f7e97eb0cc7d9cbc88830b5659d3cb535135d21280e1305d547b` |
| Reporting period | 2026-06-30 (prior 2025-06-30) |
| Acquired at (UTC, real) | 2026-08-23T05:21:59.978Z |

The loader must re-verify the resource SHA-256 and schema fingerprint against these
values before any write and **fail closed** on any difference.

## 2. Exact geography IDs / count

- **170** unique ASGS 2021 SALs (state SA, `state_code=4`), each id in the canonical
  form `SAL_<code>_ASGS3_2021` (e.g. `SAL_40085_ASGS3_2021`).
- Baseline-ID set: committed `warehouse/metadata/sa_all_sals.json` (1,696 SA SALs).
- Exactly **1** source suburb (`RIVERLEA PARK`, post-2021) is quarantined
  `geography_unmatched`; **0** ambiguous. No id is guessed.

## 3. Exact target table & column mapping

Target: additive official-metrics objects (migrations `056`/`057`/`058`, additive,
already authored + PGlite-rehearsed). No existing object altered/dropped.

`core.official_observation` (internal; no anon/authenticated grant) columns:
`observation_id, source_id, resource_sha256, geography_id, geography_level,
asgs_version, metric, property_type, bedroom_group, value, unit, sample_size,
period_start, period_end, status, quality_status, formula_version,
price_observation_id, rent_observation_id, licence, attribution, retrieved_at`.

Projected to `mart.official_suburb_metric` for direct/derived rows; exposed via
`public.get_official_suburb_metrics_v1(geography_id)` (direct + derived) and
`public.v_official_suburb_metric_v1` (direct only).

| Candidate metric | → target `metric` | `property_type` | `bedroom_group` | `unit` | `status` |
|---|---|---|---|---|---|
| `median_sale_price_detached` | `median_house_price` | `house` | `all` | `AUD` | `direct` |
| `annual_price_growth_12m` | `price_growth_12m` | `house` | `all` | `%` | `derived` |

- `median_house_price`/`house` is the **detached-house** median. It is **not**
  written to the main snapshot's `median_sale_price_detached` column and is **not**
  `median_sale_price_12m` (overall). The main price card is untouched.
- `price_growth_12m` is signed, bounded `[-100, 1000]` (migration 058), value =
  publisher "Median Change" × 100 (lineage preserved), classified `derived`.
- `retrieved_at` = the real acquisition timestamp (§1). `asgs_version=ASGS3_2021`,
  `geography_level=suburb`.

## 4. Exact natural / upsert keys

- `core.official_observation`: PK `observation_id` = deterministic content address of
  `source_id | geography_id | metric | property_type | bedroom_group | period_end |
  resource_sha256`. Insert is `on conflict (observation_id) do nothing` — an existing
  id with a **different** value is never overwritten (fail closed).
- `mart.official_suburb_metric`: PK / upsert key
  `(geography_id, metric, property_type, bedroom_group, period_end)`,
  `on conflict … do nothing`.

## 5. Maximum inserted / updated row count

- Core: **≤ 340** rows (170 `median_house_price` + 170 `price_growth_12m`).
- Mart: **≤ 340** rows (same natural keys; distinct metric per row).
- The loader enforces `rows.length ≤ ROW_CAP (340)` and refuses if exceeded.
- Idempotent re-run inserts/updates **0** additional rows.

## 6. Environment guards (branch only)

- Reads `WAREHOUSE_VALIDATION_DB_URL` from `.env.local`; the URL is **never printed**.
- **Refuses** if the URL references the Production ref `oshquaxsloolqucwvigc`.
- **Refuses** unless the URL references the approved disposable/validation branch ref
  (**HUMAN-CONFIRM PLACEHOLDER** — the specific branch ref must be supplied at approval
  time; the loader accepts it via `--branch-ref <ref>` and re-checks it against the URL).
- No Storage, Vercel, environment-variable, `main`, or Production access. SSL on;
  `statement_timeout` set.

## 7. Transaction boundaries & dry-run default

- **Dry-run is the default** (no DB connection): verifies checksum/fingerprint/row-cap,
  prints the sanitised plan, and stops.
- Execution requires the explicit flag `--execute` **and** a valid non-Production
  branch ref. All writes happen inside **one** `BEGIN … COMMIT`; any post-load gate
  failure triggers `ROLLBACK` (branch unchanged).

## 8. Before / after read-only SQL

```sql
-- BEFORE (read-only)
select count(*) from core.official_observation where source_id = 'sa_metro_median_house_sales';
select metric, count(*) from mart.official_suburb_metric
  where source_id = 'sa_metro_median_house_sales' group by 1 order by 1;
-- AFTER (read-only) — expect core delta ≤ 340, mart delta ≤ 340
```

## 9. Duplicate / conflict checks

- Pre-load: scan payload ids already stored with a **different** value → abort if any.
- Insert `on conflict do nothing` guarantees existing content is never overwritten.
- Post-load conflict probe: re-insert one id with `value+1`; assert the stored value
  is unchanged.

## 10. Validation queries (each must return 0 violations)

```sql
-- value / metric-aware bounds
select count(*) from mart.official_suburb_metric where metric <> 'price_growth_12m' and value <= 0;
select count(*) from mart.official_suburb_metric where metric = 'price_growth_12m' and (value < -100 or value > 1000);
-- period
select count(*) from core.official_observation where source_id='sa_metro_median_house_sales' and period_end <> date '2026-06-30';
-- property type
select count(*) from core.official_observation where source_id='sa_metro_median_house_sales' and property_type <> 'house';
-- source / provenance
select count(*) from core.official_observation where source_id='sa_metro_median_house_sales' and (resource_sha256 <> '9cfa8aa7…' or retrieved_at is null or licence is null);
-- direct-only view never shows non-direct
select count(*) from v_official_suburb_metric_v1 where status <> 'direct';
-- contextual never reaches the mart
select count(*) from mart.official_suburb_metric where status = 'contextual';
-- row count
select count(*) from core.official_observation where source_id='sa_metro_median_house_sales';  -- expect ≤ 340
```

## 11. Cleanup SQL (scoped ONLY by source id + file checksum / run id)

```sql
delete from mart.official_suburb_metric
  where source_id = 'sa_metro_median_house_sales'
    and (geography_id, metric, property_type, bedroom_group, period_end) in (
      select geography_id, metric, property_type, bedroom_group, period_end
      from core.official_observation
      where source_id = 'sa_metro_median_house_sales'
        and resource_sha256 = '9cfa8aa71d2c453c09ca1d3baecc1955144863cfb5c4caef01c12266e639ef7a');
delete from core.official_observation
  where source_id = 'sa_metro_median_house_sales'
    and resource_sha256 = '9cfa8aa71d2c453c09ca1d3baecc1955144863cfb5c4caef01c12266e639ef7a';
```

Cleanup never touches any other source, checksum, or geography. No existing object
is dropped.

## 12. Rollback verification

- In-transaction sentinel proof: insert a sentinel id inside a `BEGIN`, confirm it is
  visible, `ROLLBACK`, confirm it is gone and the candidate row count is unchanged.
- After a scoped cleanup, re-run the BEFORE queries and confirm the source's row
  counts return to their pre-load values.

## 13. Branch lifetime / cost — HUMAN CONFIRM

- Disposable-branch ref, region, size ceiling, expected growth, lifetime and cost are
  **placeholders requiring explicit human confirmation** before execution. The loader
  refuses to run without an explicit branch ref and the `--execute` flag.

## 14. Execution status

**Execution is NOT approved.** This run performed the offline dry-run path and unit
tests only. Applying migrations `056/057/058` and loading rows to a disposable branch
is a separate, human-approved step. Production and founding-beta configuration are
untouched.

## Stop conditions

Fail closed on: project/branch/commit identity mismatch; missing/changed licence;
HTML/portal error returned as data; checksum or schema-fingerprint drift; unknown,
cross-state or ambiguous geography; suppression / non-positive / impossible-period
value (price/rent metrics); duplicate natural key or non-idempotent rerun; candidate
count below the approved threshold; unexpected value distribution; any Production
reference/write/deploy/environment change; any attempt to reinterpret the detached
median as an overall/all-property median.
