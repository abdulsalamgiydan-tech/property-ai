# deal_score_v1 — Deal Hunter scoring specification

Deterministic, versioned per-listing scoring for the V7B Deal Hunter. Separate from the suburb-level
`opportunity_score_v1` (V6A) — it reuses that engine's tested sub-indices for suburb fit and reuses
`analyzeProperty` (via `scenarioFor`) for the cash-flow estimate. **Hard gates are applied before any
weighting**, so a strong weighted score can never hide a gate failure.

## Inputs (by evidence class)
- **Listing facts** (provider): effective price, property type, bedrooms, bathrooms, land area.
- **Market evidence** (official): `median_rent`, `gross_yield`, `price_growth_12m`, `sales_volume`,
  `median_house_price` — each with provenance; used only when **fresh** (≤ `HARD_STALE_DAYS` = 540).
- **User assumptions**: deposit, max price, acceptable weekly holding cost, strategy, risk.
- **Estimate**: cash-flow scenario from listing price + suburb rent + labelled assumptions.
- **Missing/stale**: any mandatory metric absent or stale → listed, never back-filled.

## Hard gates (pass/fail, applied first)
| Gate | Fails when |
|---|---|
| `state_not_eligible` | listing state ∉ buy box eligible states |
| `property_type_excluded` | listing type ∉ buy box property types |
| `explicitly_excluded` | listing key/suburb ∈ exclusions |
| `below_min_bedrooms` | `minBedrooms` set and `bedrooms < minBedrooms` |
| `above_price_budget` | effective price > `maxPurchasePrice` |
| `deposit_too_small` | deposit < price·(1−maxLVR) + price·bufferPct |
| `exceeds_holding_budget` | modelled weekly out-of-pocket > `maxWeeklyHoldingCost` |

`maxLVR` by risk: low 0.80, medium 0.88, high 0.90. SA acquisition buffer = 6%.
Any failure → the deal is **ineligible** (shown with reasons), never ranked. Undisclosed price → the
price/deposit gates cannot be evaluated → routed to **needs review** (no invented price).

## Sub-indices (0–100)
- **affordability** — headroom under budget: `lerp(headroom, −0.1→0, 0.3→100)`; null price → 50.
- **cashflow** — positive → 100; else scales `lerp(outOfPocket/limit, 0→90, 1→20)`; null → 50.
- **yield** — `yieldIndex(grossYield)` (reused); null → 40.
- **suburbFit** — `wG·growthIndex + wY·yieldIndex + wD·demandIndex`, with
  `wG = 0.34 + 0.16·gvy`, `wY = 0.34 − 0.16·gvy`, `wD = 0.32` (gvy = growth↔yield lean ∈ [−1,1]).
- **propertyFit** — neutral 60; ±beds vs min; +land when `prefer_land`.
- **downsideResilience** — `40 + 40·confidence`, +20 if cash-flow ≥ 0, −20 if out-of-pocket > 0.8·limit, −15 if price undisclosed.
- **evidenceCompleteness** — `presentFreshMandatory / 5 · 100`.

## Weighted total
```
score = 0.20·affordability + 0.18·cashflow + (0.12 − 0.04·gvy)·yield
      + (0.20 + 0.04·gvy)·suburbFit + 0.10·propertyFit
      + 0.12·downsideResilience + 0.08·evidenceCompleteness
```
Bands: **strong ≥ 70**, **moderate ≥ 45**, else **weak**. Confidence = `(freshMandatory/5)·(priceUndisclosed?0.6:1)`.

## Ranking buckets
- **ranked** — eligible, price disclosed, `confidence ≥ minConfidence` (high 0.8 / medium 0.5 / low 0.3), sorted by score desc then key.
- **needsReview** — eligible but price undisclosed or below the confidence floor.
- **ineligible** — one or more hard-gate failures (sorted by score for display only).

## Worked examples (from the labelled replay dataset + test evidence)

### 1. Grange RPL-0001 — a ranked match
Facts: house, price range A$820k–860k (effective **A$840k**), 3🛏 1🛁, land 620 m².
Buy box: max A$900k, deposit A$400k, strategy growth (gvy=+1), holding ≤ A$600/wk, SA, medium risk.
Evidence: rent A$520/wk, yield 3.4%, growth 6.0%, volume 40 (all fresh).
- Hard gates: price 840k ≤ 900k ✓; required cash = 840k·0.12 + 840k·0.06 = **A$151,200** < 400k ✓;
  modelled weekly out-of-pocket (from `analyzeProperty`) < A$600 ✓ → **eligible**.
- Estimate: gross yield ≈ 3.2–3.4%, weekly cash-flow modelled from price+rent+assumptions.
- Result: **ranked**, band per score; `whyMatches` cites growth 6.0% (SA-VG · 2026-06-30) and the cash-flow line.

### 2. Unley RPL-0004 — hard gate beats a strong suburb
Facts: house, **A$1,650,000**. Suburb growth 8.0% (highest in the set).
- `above_price_budget` fails (1.65M > 900k) → **ineligible**, shown with the reason. Its high suburb-fit
  never moves it into `ranked`. (Proven by test.)

### 3. Belair RPL-0002 — undisclosed price
Facts: house, **"Contact Agent"** (no bounds).
- Price/deposit gates un-evaluable → **needs review**; `estimate = null` (no invented price);
  `whyMayNot` notes affordability can't be assessed; `verifyNext` = ask agent for a price guide.

### 4. Missing rent
If a suburb has no fresh `median_rent`, the cash-flow **estimate is unavailable** (not zero, not guessed);
`missing` includes `median_rent`, `couldKillDeal` explains it, and confidence drops.

## Determinism & provenance
Same inputs → identical ordered output (asserted). Every displayed figure carries its class label and, for
market evidence, `source_id · period`. The engine narrates deterministic output; it never generates a
price, rent, yield, growth or attribute.
