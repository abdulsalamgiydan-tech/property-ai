# NSW Gross Yield Pilot Report (Sprint 6, Part F)

Generated: 2026-07-20 (run details: `nsw_yield_pilot_report.json`)
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production touched: NO.**

**This is a descriptive research statistic, not an investment recommendation, score,
AVM or forecast** (stated explicitly in the mart table comments, migration 009).

## Method

Gross yield combines two independently-sourced pilot datasets already on the branch:

- **Rent**: NSW DCJ Rent and Sales Report, quarterly median weekly rent (Sprint 6)
- **Sales**: NSW Valuer General PSI, annual median sale price (Sprint 5)

Each rent quarter is matched to the sales mart's annual figure for the **calendar year
containing that quarter** (documented per-row in `source_summary.sales_period_basis`),
matched on identical `dwelling_type` (only `detached_house` and `apartment_unit` exist
on both sides in this pilot — sales never classified `townhouse_villa_semidetached`
or `other_residential`, and rent has no `residential_land` equivalent, so those
categories legitimately produce rent-only or sales-only data, never a yield row).

```
annualised_rent = median_weekly_rent * 52
gross_yield_percentage = annualised_rent / median_sale_price * 100
```

## Results

| mart | rows | with computed yield | confidence: high | medium | insufficient |
|---|---|---|---|---|---|
| `mart.suburb_yield_quarterly` | 3,305 | 1,083 | 728 | 355 | 2,222 |
| `mart.postcode_yield_quarterly` | 3,251 | 1,133 | 1,124 | 9 | 2,118 |

**Every row exists** regardless of whether yield could be computed — rows without
sufficient sales/rent confidence or data still appear with `gross_yield_percentage =
NULL` and `yield_confidence_label = 'insufficient'`, per the task's rule. Verified:
**zero** rows have a non-NULL yield without an accompanying high/medium confidence
label (blocking gate in the loader).

## Gross yield range (postcode, computed rows only)

Min **1.42%** · Max **7.53%** · Average **3.30%**

These figures are consistent with known real-world NSW residential gross yield
ranges (typically ~2-5% for houses, somewhat higher for units), which is a useful
sanity check on the whole pipeline (geography joins, dwelling-type matching, period
alignment) rather than a claim about investment quality.

## Known limitations

- Sales-side is annual, rent-side is quarterly — the match uses the calendar year
  containing each rent quarter, not a true quarter-to-quarter comparison.
- Suburb (SAL) rent is derived via correspondence (see the branch load report) —
  suburb yield therefore carries one more layer of approximation than postcode yield.
- Only 2 of 5 rent dwelling types have a sales-side counterpart in this pilot; yield
  for townhouse/villa/other/land dwelling types cannot be computed from this pilot's
  sales classification.

## Next step

Expand the sales pilot's dwelling-type classification (townhouse/villa detection) to
widen yield coverage, or expand both pilots to full NSW. RLS on warehouse schemas
still undecided before anything approaches production.
