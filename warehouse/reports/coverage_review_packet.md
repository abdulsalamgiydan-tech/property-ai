# Coverage review packet — WA weekly sales candidate

As of: 2026-08-23

## Decision

- Local gates: PASS
- Publishable: **NO**
- Production publish delta: **0**
- Production coverage changed: **NO**

## Verified local evidence

- Accepted canonical observations: 4
- Candidate SAL IDs: SAL50018, SAL51124
- Parser quarantines: 4
- Mapping quarantines: 1
- Sanitised fixture payload checksum: `0e66dfcbc5b1dfe6a861c3eaeb5ed0894e4160fac5530acd4b0f39df935a92f2`
- Checksum scope: SHA-256 of the committed sanitised NORMALISED_ROWS JSON payload; not an official resource checksum
- Freshness: fixture_only_not_a_live_refresh (2026-08-21)
- Licence: Creative Commons Attribution 4.0 (catalogue listing); live resource match = false

These candidate metrics are weekly sales count and turnover. They are **not** median prices and cannot unlock price, yield, or growth coverage. Exact new-WA overlap remains unresolved because the committed baseline contains aggregate counts, not state/source geography-ID sets.

## Quarantine summary

- ambiguous_asgs_match_for_SPRINGFIELD_WA_(2_candidates): 1
- non_positive_or_suppressed_sales_count: 1
- non_positive_or_suppressed_turnover: 1
- unparseable_period: 1
- wrong_state: 1

## Blocking conditions

- official machine-readable resource/header not acquired
- candidate exposes weekly count/turnover, not median sale price
- no validation-branch database run approved or performed

## Future write scope

No tables, zero rows and no executable validation command are approved in this packet. A separate validation-branch approval is required.
