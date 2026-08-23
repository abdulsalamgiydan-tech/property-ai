# Validation Approval Packet — SA metropolitan house-price batch (Official Coverage Uplift 1.2)

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

Target: official-metrics objects from migrations `056`/`057`/`058`. The rollback
validation harness **never applies migrations**. It requires all three versions in
`supabase_migrations.schema_migrations` and independently verifies the core table,
mart table, direct-only view, consumer RPC and migration-058 signed-growth
constraint before the first candidate insert. Missing ledger or physical structure
fails closed.

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
  resource_sha256`. Before insertion, every existing id is compared across all
  value, period, geography, classification, lineage, licence, attribution and
  freshness fields. Any difference fails closed; exact matches are retained.
- `mart.official_suburb_metric`: PK / upsert key
  `(geography_id, metric, property_type, bedroom_group, period_end)`,
  Every existing natural key is likewise compared field-for-field before insertion;
  any differing value/provenance fails closed. `on conflict … do nothing` is used
  only after that exact-content preflight.

## 5. Maximum inserted / updated row count

- Core candidate: **exactly 340** rows (170 `median_house_price` + 170
  `price_growth_12m`).
- Mart candidate: **exactly 340** distinct natural keys.
- The harness refuses a partial batch, an oversized batch, duplicate observation
  ids or duplicate mart keys.
- Exact simulated deltas are calculated from new vs exact-pre-existing rows and
  asserted after load. An identical second load must produce delta **0**.
- All simulated new rows are rolled back; retained delta is always **0**.

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
- Execution requires both `--execute --rollback-validation` **and** a valid,
  exact non-Production branch ref. `--commit`, `--retain` and `--cleanup` are
  explicitly rejected.
- Migration-ledger and physical-structure checks, conflict preflight, candidate
  inserts, exact delta assertions, scoped validations, RPC/view verification and
  identical replay all occur inside **one transaction**.
- The sole terminal transaction action is intentional **`ROLLBACK`**, including on
  success. There is no `COMMIT` path. A second, fresh database connection then
  proves the exact pre-run candidate snapshot was restored.

```bash
node warehouse/scripts/promotion/validate_sa_house_price_branch.mjs \
  --execute --rollback-validation --branch-ref <approved-disposable-ref>
```

## 8. Before / after scope

- Core before/after snapshots are keyed by the exact 340 content-addressed
  `observation_id` values.
- Mart snapshots are keyed by the exact 340 natural keys.
- Existing exact rows are preserved. Unrelated rows—even from the same source or
  checksum—are outside the run and cannot affect validation counts.
- First-load deltas must equal the preflight-calculated new-row counts; second-load
  deltas must equal zero; post-rollback deltas must equal zero.

## 9. Duplicate / conflict checks

- Pre-load: compare all core content/provenance fields and all mart value/provenance
  fields. A mismatch on either key aborts before inserts.
- Insert `on conflict do nothing` is therefore idempotency protection, not a
  substitute for conflict detection.
- After load: all 340 core rows and all 340 mart keys must exist and exactly match
  the candidate. The identical replay must change nothing.

## 10. Candidate-scoped validation gates

All row-level validation queries are scoped to the exact candidate observation ids.
They assert: non-growth values positive; growth within `[-100,1000]`; prices direct;
growth derived with formula lineage; exact suburb/ASGS/house/all shape; complete
licence/attribution/checksum/freshness provenance. Every candidate row is then
verified through `get_official_suburb_metrics_v1`; derived growth must have
`is_derived=true` and its formula label. The direct-only view must contain each
direct price and exclude every derived growth row.

## 11. No cleanup/delete path

Uplift 1.2 removes the earlier source+checksum cleanup mode. Such a delete could
remove an exact row that existed before the run. Restoration is transaction rollback
plus exact snapshot comparison only. No table, row or branch deletion is performed.

## 12. Rollback verification

- The complete real candidate—not merely a sentinel—is loaded and validated inside
  the transaction, then intentionally rolled back.
- A fresh connection re-reads all 340 core ids and 340 mart keys and compares them
  with the exact before snapshot. New rows must be absent; pre-existing exact rows
  must remain field-for-field equivalent across all compared database fields.
- Injected failures after core insert, after mart insert, before validations and
  after validations are PGlite-tested to leave zero new residue.

## 13. Branch lifetime / cost — HUMAN CONFIRM

- Disposable-branch ref, region, size ceiling, expected growth, lifetime and cost are
  **placeholders requiring explicit human confirmation** before execution. The harness
  refuses to run without an explicit branch ref and both rollback-validation flags.

## 14. Execution status

**Execution is NOT approved.** This implementation and its PGlite tests touch no
remote database. Provisioning a disposable branch with migrations `056/057/058`
and authorising the rollback-only validation command are separate human-controlled
steps. The harness itself will not apply those migrations and will not retain the
candidate. Production and founding-beta configuration remain untouched.

## Stop conditions

Fail closed on: project/branch/commit identity mismatch; missing/changed licence;
HTML/portal error returned as data; checksum or schema-fingerprint drift; unknown,
cross-state or ambiguous geography; suppression / non-positive / impossible-period
value (price/rent metrics); duplicate natural key or non-idempotent rerun; candidate
count below the approved threshold; unexpected value distribution; any Production
reference/write/deploy/environment change; any attempt to reinterpret the detached
median as an overall/all-property median.
