# Scoring specification — `opportunity_score_v1`

Version: **opportunity_score_v1** · Status: draft (SA vertical slice) · Owner: `lib/opportunity/opportunityScoreV1.ts`

This is a **suburb-level** opportunity score. It is **new and separate** from the
per-deal `combineDealModelScore` (`lib/propertyAnalysis.ts`), which is unchanged.
Every result payload carries `score_version: "opportunity_score_v1"`.

Three independent axes are computed and stored/displayed separately
(ADR D2): **affordability fit**, **opportunity score**, **data confidence**.

---

## 1. Evidence dimensions

### Mandatory (must be present AND fresh, else the suburb is EXCLUDED — never scored low)
| Dimension | Warehouse metric | Used by |
|---|---|---|
| Price level | `median_house_price` (direct) | affordability, cash-flow |
| Rent | `median_rent` (direct) | cash-flow, yield context |
| Yield | `gross_yield` (derived) | opportunity (yield index) |
| Demand | `sales_volume` (direct, 12m) | opportunity (demand index) |
| Growth | `price_growth_12m` (direct, **signed**) | opportunity (growth index) |

### Optional (missing lowers CONFIDENCE only; never enters the opportunity score)
| Dimension | Warehouse metric | Used by |
|---|---|---|
| Supply | `approvals_per_1000_dwellings` | confidence + evidence drawer |
| Demographic | `population_growth_pct`, `median_weekly_household_income` | confidence + evidence drawer |

Rationale (ADR D3): every eligible suburb carries the identical mandatory basis, so
the opportunity score is **not** renormalised over a variable set; a missing metric
either **excludes** the suburb (mandatory) or only reduces **confidence** (optional).
Missing data is therefore never treated as zero and can never improve a ranking.

---

## 2. Sub-indices (each 0–100, piecewise-linear, clamped)

`lerp(x; x0,y0, x1,y1)` = linear interpolation, clamped to `[0,100]`.

**Growth index** (signed `price_growth_12m`, unit %):
```
g ≤ -5   → 0
-5..0    → lerp(g; -5,0,   0,30)
0..5     → lerp(g;  0,30,  5,60)
5..12    → lerp(g;  5,60, 12,90)
12..20   → lerp(g; 12,90, 20,100)
g ≥ 20   → 100
```

**Yield index** (`gross_yield`, unit %):
```
y ≤ 2.5  → 0
2.5..3.5 → lerp(y; 2.5,0,  3.5,45)
3.5..5.0 → lerp(y; 3.5,45, 5.0,80)
5.0..6.5 → lerp(y; 5.0,80, 6.5,100)
y ≥ 6.5  → 100
```

**Demand index** (`sales_volume`, 12-month transaction count):
```
v ≤ 5    → 0
5..15    → lerp(v;  5,0,  15,50)
15..40   → lerp(v; 15,50, 40,85)
40..80   → lerp(v; 40,85, 80,100)
v ≥ 80   → 100
```

Each sub-index is computed **only** from a present mandatory metric. There is no
"default" or "zero" path for a missing mandatory metric — its absence is handled by
the eligibility gate (§4), not by the sub-index.

---

## 3. Strategy weights (over the three opportunity sub-indices; sum = 100)

| Strategy (UI label) | internal id | growth | demand | yield |
|---|---|---|---|---|
| Growth | `growth` | 60 | 25 | 15 |
| Balanced | `balanced` | 40 | 25 | 35 |
| Cash-flow | `yield` | 20 | 20 | 60 |

```
opportunity_score_v1 = round( (wGrowth/100)*growthIdx
                             + (wDemand/100)*demandIdx
                             + (wYield /100)*yieldIdx )
```
Integer 0–100. Because all three dimensions are mandatory (present for every eligible
suburb), no renormalisation is applied.

**Weight-change explainability (Assurance A2):** switching strategy re-weights the
same three fixed sub-indices, so any score delta decomposes exactly into
`Σ (Δweight_i/100) * subindex_i`. Tests assert this identity.

---

## 4. Eligibility gate (per suburb, evaluated before scoring)

A suburb is **eligible** only if ALL hold, else it is **excluded** with a machine
reason (surfaced honestly as "insufficient evidence" / "above budget", not as a low score):

1. `property_type` matches the user's house/unit preference.
2. `state` ∈ user's allowed states (SA only in this slice; other states honestly blocked).
3. All 5 **mandatory** metrics present (non-null).
4. **Freshness:** every mandatory metric's `retrieved_at` is within `HARD_STALE_DAYS = 540`
   of `asOf`. Beyond that → excluded (`reason: "stale_evidence"`). Between
   `SOFT_STALE_DAYS = 400` and 540 → eligible but confidence penalised (§6) and the
   row is flagged `stale = true` for the stale-data UI state.
5. **Affordability (hard):** `median_house_price ≤ maxPrice`; and the deposit funds at
   least a 5% deposit for that price (`deposit ≥ 0.05 * median_house_price`), else
   excluded (`reason: "above_price_budget"` / `"deposit_too_small"`).
6. **Holding-cost (hard):** the cash-flow scenario's weekly holding cost (after-tax,
   §5) must be ≤ the user's `acceptableWeeklyHoldingCost`, else excluded
   (`reason: "exceeds_holding_budget"`). A positive-cashflow suburb always passes.

Excluded suburbs are returned in a separate `excluded[]` list (with reason) so the UI
can honestly report "N suburbs set aside because …" — they never leak into `ranked[]`
(Assurance A5).

---

## 5. Cash-flow scenario (reuses the tested deal engine — never re-implemented)

For each eligible suburb, `analyzeProperty` (`lib/propertyAnalysis.ts`) is called with:
- `purchasePrice = median_house_price` (warehouse), `weeklyRent = median_rent` (warehouse),
- `depositPercent = deposit / median_house_price * 100`,
- `interestRatePercent = ASSUMED_INVESTOR_RATE` (documented constant, labelled assumption),
- `annualExpenses = ASSUMED_ANNUAL_EXPENSES`, `state = "SA"`, `strategy`, defaults per spec.

Outputs surfaced (all labelled **scenario, not advice**): gross yield, weekly & annual
after-tax cash-flow, LVR, total cash required. The weekly holding cost used by the
eligibility gate is `-min(0, afterTaxCashflow)/52`. All assumptions are shown in the
evidence drawer. **No figure is invented** — price and rent are warehouse values;
everything else is a labelled assumption or a deterministic derivation.

---

## 6. Data confidence (separate 0–100 axis)

Start at 100, apply deductions, clamp `[0,100]`:
- Each mandatory metric in soft-stale window (400–540 days): **−15**.
- `sales_volume` sample size `< 10`: **−10**; `< 5`: additional **−10**.
- `gross_yield` sample size `< 10`: **−10**.
- Each **optional** dimension missing (supply, demographic): **−10**.

Band: `high ≥ 75`, `medium ≥ 50`, `low ≥ 30`, else `insufficient`. Confidence is shown
next to (never folded into) the opportunity score. Missing/stale evidence therefore
**reduces confidence or excludes** — it can never raise a ranking (Assurance A3).

---

## 7. Affordability fit (separate 0–100 axis)

Among eligible suburbs, `fit = round( 100 * clamp01( headroom ) )` where
`headroom = (maxPrice - median_house_price) / maxPrice` blended 50/50 with deposit
comfort `clamp01( (depositPct - 5) / 15 )`. Shown as a fit meter; used only as a
secondary sort key, never mixed into opportunity or confidence.

---

## 8. Deterministic ranking + tie-break

`ranked[]` is sorted by, in order: `opportunity_score_v1` desc → `confidence` desc →
`affordability_fit` desc → `geography_id` asc (lexicographic, stable). Integer scores +
lexicographic final key ⇒ a total order ⇒ identical inputs always yield an identical
ranking (Assurance A1). No randomness, no wall-clock dependence (freshness uses the
explicit `asOf` input).

---

## 9. Provenance (every material figure)

Each ranked result carries, per material metric, the originating
`{ source_id, licence, attribution, period_start, period_end, retrieved_at, status:
direct|derived, provider }` straight from the RPC row. The UI renders source + period
+ freshness for every displayed number; a test asserts every displayed figure maps to a
provenance record (Assurance A6).
