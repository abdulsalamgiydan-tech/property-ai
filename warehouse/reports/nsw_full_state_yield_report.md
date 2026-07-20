# NSW Gross Yield Full-State Report (Sprint 7, Part D)

Generated: 2026-07-20 (run details: `nsw_full_state_yield_report.json`)
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production touched: NO.**

**This is a descriptive research statistic, not an investment recommendation, score,
AVM or forecast** (stated explicitly in the mart table comments, migration 009).

## Method (unchanged from Sprint 6 pilot, now applied statewide)

Gross yield combines two independently-sourced, now full-NSW datasets on the branch:

- **Rent**: NSW DCJ Rent and Sales Report, quarterly median weekly rent
- **Sales**: NSW Valuer General PSI, annual median sale price (2001-current)

Each rent quarter is matched to the sales mart's annual figure for the **calendar
year containing that quarter**, matched on identical `dwelling_type`. No yield is
computed without both sides having `sample_size_confidence`/`confidence_label` in
(`high`,`medium`); rows without sufficient sample still appear with
`gross_yield_percentage = NULL` and `yield_confidence_label = 'insufficient'`.

```
annualised_rent = median_weekly_rent * 52
gross_yield_percentage = annualised_rent / median_sale_price * 100
```

## Results

| mart | rows | confidence: high | medium | insufficient |
|---|---|---|---|---|
| `mart.suburb_yield_quarterly` | 21,359 | 4,933 | 2,273 | 14,153 |
| `mart.postcode_yield_quarterly` | 20,583 | 6,919 | 205 | 13,459 |

**Every row exists** regardless of whether yield could be computed — rows without
sufficient sales/rent confidence or data still appear with `gross_yield_percentage =
NULL` and `yield_confidence_label = 'insufficient'`, per the task's rule. Verified
independently via MCP: **zero** rows have a non-NULL yield without an accompanying
high/medium confidence label (both the in-transaction blocking gate and an
independent post-commit query confirm this).

## Gross yield range (postcode, computed rows only)

Min **1.19%** · Max **10.25%** · Average **3.41%**

These figures remain consistent with known real-world NSW residential gross yield
ranges (typically ~2-5% for houses, higher for units/regional postcodes), a useful
statewide sanity check on the geography joins, dwelling-type matching, and period
alignment across the full pipeline.

## Known limitations (unchanged from pilot, now statewide)

- Sales-side is annual, rent-side is quarterly — the match uses the calendar year
  containing each rent quarter, not a true quarter-to-quarter comparison.
- Suburb (SAL) rent is derived via a POA→SAL correspondence chain (DCJ never
  publishes at SAL grain) — suburb yield therefore carries one more layer of
  approximation than postcode yield.
- Only dwelling types present on both the sales and rent sides produce a yield row;
  categories unique to one side (e.g. `residential_land` on sales,
  `other_residential` on rent where unmatched) legitimately never produce yield.
- `insufficient` remains the majority label at this fine grain (suburb/postcode x
  quarter x dwelling type) — expected given genuinely thin transaction/bond volume
  in many small NSW localities; medians and yields for `high`/`medium` cells are
  reliable, `insufficient` cells are published for completeness only.

## Next step

Full-state yield coverage is now available for both suburb and postcode grain,
2001-current sales history matched against DCJ's full published rent history. RLS
on warehouse schemas remains undecided before anything approaches production.
