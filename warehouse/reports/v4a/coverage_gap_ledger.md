# National coverage-gap ledger (official CC-BY lanes)

_as-of 2026-08-02 · payload `cbd0b269d5ff…`_

Covered **7** · gap **3** · blocked **5** (of 15 cells).

| State | Metric | Type | Status | Suburbs | Source / reason |
|---|---|---|---|--:|---|
| SA | median_house_price | house | ✅ covered | 92 | data.sa.gov.au (CC BY) |
| SA | median_rent | house | ✅ covered | 153 | data.sa.gov.au (CC BY) |
| SA | median_rent | unit | ✅ covered | 71 | data.sa.gov.au (CC BY) |
| SA | sales_volume | house | ✅ covered | 92 | data.sa.gov.au (CC BY) |
| SA | gross_yield | house | ✅ covered | 83 | derived |
| VIC | median_house_price | house | ➖ gap |  | No accepted CC-BY VIC house-price source: land.vic.gov.au median-house .xls returns HTTP 403 (recorded, not circumvented). |
| VIC | median_rent | house | ✅ covered | 34 | dffh.vic.gov.au (CC BY) |
| VIC | median_rent | unit | ✅ covered | 35 | dffh.vic.gov.au (CC BY) |
| VIC | sales_volume | house | ➖ gap |  | No accepted CC-BY VIC sales-volume source in this release (DFFH suburb file is rent only). |
| VIC | gross_yield | house | ➖ gap |  | Derived yield requires a direct VIC house price, which is absent (see VIC house-price gap) — no yield produced. |
| NSW | median_house_price | house | ⛔ blocked |  | BLOCKED: NSW VG PSI weekly/annual sales return HTTP 403; no CC-BY residential-sales bulk on data.nsw.gov.au. |
| NSW | median_rent | house | ⛔ blocked |  | BLOCKED: no accepted CC-BY NSW suburb rent source onboarded this release. |
| NSW | median_rent | unit | ⛔ blocked |  | BLOCKED: no accepted CC-BY NSW suburb rent source onboarded this release. |
| NSW | sales_volume | house | ⛔ blocked |  | BLOCKED: depends on the same NSW VG PSI sales feed (HTTP 403). |
| NSW | gross_yield | house | ⛔ blocked |  | BLOCKED: no NSW price or rent inputs accepted — no yield produced. |

> NSW is blocked (VG PSI 403; no CC-BY residential-sales bulk). VIC has no CC-BY house price, so no VIC yield. SA is fully covered incl. qualified house yields.
