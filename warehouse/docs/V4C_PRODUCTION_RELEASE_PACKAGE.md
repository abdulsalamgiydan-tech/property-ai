# V4C — Production release package (rehearsed, NOT applied to Production)

**Production was NOT touched.** This package is the fully rehearsed Production
release for the SA + VIC official-metrics lane and its consumer path. The
candidate is already loaded on the Supabase **validation branch**
(`lzonauinzatmtytyoems`) — see [V4A_PROMOTION_PACKAGE.md](./V4A_PROMOTION_PACKAGE.md).
Nothing here has been applied to Production (`oshquaxsloolqucwvigc`), `main`,
Vercel, remote env vars, Storage or Stash, and no further remote DB write was made.

## V4D correction (2026-08-03) — migration 055 made Production-applicable
The first V4D Production attempt at candidate `9cd403f` **failed atomically on
migration 055** (Postgres `42P13: cannot change return type of existing function`):
`CREATE OR REPLACE` cannot widen a function's `RETURNS TABLE` when the narrower
migration-052 version already exists. **Production was left completely untouched**
(history still 054/046; no rollback needed). The rehearsal missed it because it
created the function on a blank DB rather than *replacing* the existing narrow one.
Migration 055 is now `DROP FUNCTION IF EXISTS` (no CASCADE) → recreate the exact
57-column contract → `REVOKE` PUBLIC → `GRANT EXECUTE` to anon/authenticated/
service_role (restoring the post-046 ACL; `DROP` clears grants, unlike `CREATE OR
REPLACE`). The release rehearsal now starts from the real 052 narrow function and
verifies the 57-column contract, the preserved ACL/SECURITY DEFINER/STABLE/
search_path, and atomic rollback. **Candidate `9cd403f` is SUPERSEDED**; a fresh
Production approval is required for the corrected head.

## Exact release contents (apply strictly in this order)
1. **`055_widen_get_market_snapshot_v2.sql`** — **DROP (no CASCADE) + recreate**
   widening the existing snapshot RPC to the full 57-column contract (adds
   `direct_or_derived`, `rba_rate_*`, `sales_turnover_pct`, investor repayment,
   etc.) and restoring the intended ACL (PUBLIC revoked; EXECUTE for anon,
   authenticated, service_role). Atomic; reversible by re-running migration 052's
   definition + 046's grant. Corrected in V4D.
2. **`056_official_suburb_metrics.sql`** — additive `core.official_observation`,
   `mart.official_suburb_metric`, and the **direct-only** public view
   `v_official_suburb_metric_v1` (anon/authenticated SELECT on the view only).
   **Already applied on the validation branch** (V4A); part of the Production
   release because Production has not received it yet.
3. **`057_official_suburb_metrics_consumer_rpc.sql`** — SECURITY DEFINER
   `public.get_official_suburb_metrics_v1(text)` exposing direct metrics **and**
   the qualified derived yields with source, period window, freshness
   (`retrieved_at`) and direct/derived status. EXECUTE granted to
   anon/authenticated only; no table/schema grant. NEW in V4C; **not** applied
   anywhere remote.

### Pinned payload (exact, deterministic)
- 689 rows — SA 491 (incl. 83 house yields) + VIC 198; 606 direct + 83 derived.
- SHA-256 `cbd0b269d5ffc8b31501475c612172e0844bb3b69b400362d501f52b30392326`
  (`warehouse/reports/v4a/validation_load_manifest.json`; bytes gitignored).
- `price_growth_12m` excluded: signed metric, incompatible with 056's `value > 0`.

### Consumer code
- `lib/warehouse/queries.ts` → `getOfficialSuburbMetricsV1(geographyId)` calls the
  057 RPC through the read-only warehouse anon client. Unit-tested in
  `lib/warehouse/officialMetrics.test.ts`.

## Security model (why yields are exposed safely)
The 056 view is **direct-only**, so the 83 derived yields are never in the public
view. The 057 RPC is the only consumer path exposing them, and it runs SECURITY
DEFINER with a pinned `search_path` — the client receives **EXECUTE on one
function**, never a grant on `core`/`mart` (those schemas stay revoked from
anon/authenticated per migrations 046/053). Contextual/postcode and quarantined
rows (status not in direct/derived) are never returned, and no internal lineage
ids or raw checksums appear in the projection.

## Rollback (additive-only → simple drops)
```sql
drop function if exists public.get_official_suburb_metrics_v1(text);   -- 057
drop view if exists public.v_official_suburb_metric_v1;                 -- 056
drop table if exists mart.official_suburb_metric;                       -- 056
drop table if exists core.official_observation;                         -- 056
-- 055: re-run migration 052's get_market_snapshot_v2 definition to narrow back.
```
No pre-existing object is mutated; rollback leaves the 055-era objects intact
(proven in `production_release_rehearsal.test.ts`).

## Evidence (all green; commands are deterministic and re-runnable)
| Proof | Where | Result |
|---|---|---|
| Validation-branch load (056 + payload) | `validation_load_report.json` | 16/16 checks |
| Read-only re-verification | `verify_validation_branch.mjs` | 9/9 |
| **Consumer path on the branch** (anon role) | `consumer_path_proof.json` | 12/12 |
| Consumer RPC rehearsal (056+057) | `officialConsumerRpc.test.ts` | 6/6 |
| **Full release rehearsal** (055→056→057 + rollback) | `production_release_rehearsal.test.ts` | 2/2 |
| Cross-state sentinel pack | `cross_state_sentinels.json` | 4/4 invariants |
| Coverage-gap ledger | `coverage_gap_ledger.{json,md}` | 7 covered / 3 gap / 5 blocked |

## National coverage (this release)
SA fully covered incl. qualified house yields; VIC direct bedroom-specific rents
only (no CC-BY house price → no VIC yield); NSW blocked (VG PSI 403; no CC-BY
residential-sales bulk). See the coverage-gap ledger.

## EXACT Production release approval required (next hard-stop)
This is the only outstanding gate. Applying the release to **Production**
(`oshquaxsloolqucwvigc`) requires explicit human approval to, in one change window:
1. apply migrations **055 → 056 → 057 in order** to Production;
2. load the **pinned payload** (sha256 `cbd0b269…`) via the idempotent loader;
3. run the post-load + security checks (= the 16-check suite) and the consumer
   RPC proof on Production;
4. ship the consumer code (`getOfficialSuburbMetricsV1`).

No command in this repo performs that remotely, and no merge/deploy is included
here. Until that approval, the release remains rehearsed only.
