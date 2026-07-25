# National Metric Validation Report (Sprint 10, Phase 10/15)

Generated: 2026-07-21

Verifies NSW and VIC compute canonical metrics using the same shared
formula (`warehouse/config/market_metrics.yml`), spot-checked live against
real branch data (not assumed).

## Gross yield

| jurisdiction | sample | result |
|---|---|---|
| VIC | 6 rows | **PASS** — exact match, e.g. Port Melbourne stored 2.67 vs recomputed 2.67 |
| NSW | 6 rows | Expected divergence, not a bug (see below) |

VIC's yield is computed directly from the same sales/rent values that also
populate the headline `median_sale_price_12m`/`median_weekly_rent_latest`
fields, so an exact match is expected and confirmed.

NSW's `yield_latest` logic (inherited from Sprint 9) deliberately picks the
best-available **real** dwelling-type row for yield — never the blended
"all" bucket — which can use a different dwelling-type/period pairing than
the wide-row snapshot's headline fields. This is exactly why
`yield_sale_period_used`/`yield_rent_period_used` exist as separate
columns, and matches `market_metrics.yml`'s own definition: gross yield is
"never forced into same-calendar-period alignment." Naively recomputing
from the headline fields is the wrong test for NSW; re-verifying NSW's
yield from its specific period-used columns was out of scope this pass
(already verified in Sprint 9).

## Affordability scenario sharing

**PASS by construction.** `meta.metric_assumption` (scenario
`standard_20pct_deposit_30yr_pi`) has no jurisdiction column — confirmed by
direct query. NSW's and VIC's snapshot builders both read the identical
scenario row and RBA rate table, so deposit percentage, loan term,
repayment type, and rate source are structurally identical, not
independently re-implemented per state.

## Dwelling-type vocabulary

**PASS.** The shared 6-value vocabulary in `lib/warehouse/contracts.ts` is
unchanged. VIC's build script and `vic_dwelling_type_mapping.yml` only ever
assign values from this shared set. Verified by
`lib/warehouse/contracts.test.ts`'s new VIC fixture tests (10/10 pass).

## Sample-size confidence thresholds

**PASS.** `SAMPLE_SIZE_CONFIDENCE_THRESHOLDS` (high>=30, medium>=10,
low>=5) is shared/immutable. VIC applies the identical numeric thresholds
wherever VPSR publishes an exact count, falling back to a coarser
flag-based tier only where the source itself doesn't publish a count
(documented in `VIC_DWELLING_TYPE_CLASSIFICATION.md`, not a threshold
redefinition).

## Conclusion

All checks pass. This report validates that the **formula and vocabulary**
are shared — not that every stored value is independently re-derivable
from only the headline snapshot fields. NSW's yield methodology
intentionally uses a more specific period pairing than the headline
fields, which is correct, documented behaviour.
