# V5A — Signed price_growth_12m release candidate (rehearsed, NOT applied)

**No Production or validation-branch writes were made.** This is a fully-rehearsed
release candidate on `feature/v5a-signed-growth-national-data` (from `main@0bff5f0`),
plus a national-data decision pack. Migration `058` and the signed-growth payload are
rehearsed locally only (PGlite) and await a separate validation-branch approval.

## The release delta
### Migration 058 (metric-aware value invariant; additive/forward; 056 unchanged)
`supabase/migrations/058_signed_price_growth_constraint.sql` (created via the Supabase
CLI `migration new`, aligned to the repo's `0NN_` convention). It **drops** 056's
blanket `official_observation_value_positive` (`value > 0`) and **adds**
`official_observation_value_bounds`:
```
case when metric = 'price_growth_12m' then value between -100 and 1000 else value > 0 end
```
- Prices, rents, sales volume and yields stay **strictly positive**; `price_growth_12m`
  may be **negative, zero or positive**.
- **Evidence-based bounds** (one unit = **percent**): floor **-100** (a positive median
  cannot fall >100% in 12 months); ceiling **1000** (generous small-sample headroom;
  observed max ≈ 41.61). 056 is never edited; the 689 already-loaded rows stay valid.

### Provenance — DIRECT (determined from the data, not assumed)
The SA source sheet publishes a **"Median Change"** column (`h[6]`) whose ratio equals
`(current/prior − 1)` for **156/156** rows. So `price_growth_12m` is **source-reported
→ `direct`** (unit `%`, sign preserved). `parse.mjs` now exposes it; `build_sa_warehouse.mjs`
uses it for growth.

### Signed-growth payload (SEPARATE; the 689 payload is untouched)
- `build_sa_warehouse.mjs --emit-growth-payload` → `build_growth_payload.mjs`:
  **79 SA rows**, sha-256 **`7cf8a3342326d458938013e7fd843ed30f289f402894e1edb619553cdfbdb222`**,
  **3 negatives / 0 zeros, min −6.11 / max 41.61** (bounds −100..1000), period
  2025-06-30→2026-06-30. Payload bytes gitignored; manifest committed at
  `warehouse/reports/v5a/signed_growth_manifest.json`.
- The frozen 689-row payload checksum **`cbd0b269…` is unchanged**.

### Consumer + UI (existing surfaces; no redesign)
- No RPC change — `get_official_suburb_metrics_v1` (057) already returns any
  direct/derived metric with source/period/freshness/status, so growth flows through.
  Growth is direct ⇒ also in the direct-only public view.
- `MarketSnapshotView.tsx`: `price_growth_12m → "12-month price growth"` label (`%`
  formatting handles negatives); the derived-yield **footer is now conditional** on a
  `gross_yield` row (hidden on VIC rent-only profiles).

## Assurance (local PGlite; blank + Production-equivalent) — all green
`signed_growth_rehearsal.test.ts` (6) + `production_release_rehearsal.test.ts`
(055→056→057→**058**) prove: negative/zero/positive growth accepted; non-positive
prices/rents/volumes/yields rejected; growth-out-of-bounds rejected; existing rows
unchanged when 058 replaces the constraint; deterministic replay + stable checksum;
idempotency, conflict fail-closed, transactional rollback; RPC least-privilege
(anon/authenticated EXECUTE only, PUBLIC none, no core/mart access); no postcode/
contextual leak; SA/VIC/Calderwood regress cleanly. Gates: 53 tests, ESLint clean,
tsc unchanged (39 baseline, 0 new), `next build` OK, secret scan clean, Production
`get_advisors(security)` unchanged (no remote write; 058 adds no new lint class).

## National data decision pack
- `warehouse/reports/v5a/nsw_source_resolution.md` — NSW = **licensed-replacement-required**
  for sales/prices (free bulk PSI is CC BY-NC-ND, non-commercial + no-derivatives;
  commercial PSI licence required) with **rents accessible** (Rental Bond, CC BY).
- `warehouse/reports/v5a/licensed_feed_comparison.md` — ranked comparison vs ~AUD 25k/yr;
  recommendation + the exact decision required by **14 Aug 2026**; draft (unsent) enquiries.

## Exact validation-branch approval required next
Load the signed-growth candidate to the Supabase **validation branch** only:
1. apply migration **058** (drop `value>0` → add metric-aware bounds);
2. load the **79-row** signed-growth payload (sha `7cf8a334…`) via the idempotent loader;
3. run the metric-aware post-load checks (signed growth accepted; non-positive others
   rejected; growth in bounds) + the consumer-RPC proof. No Production write until a
   further approval.
