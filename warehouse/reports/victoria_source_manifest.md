# Victoria Source Manifest (Sprint 10, Phase 3)

Generated: 2026-07-21 (full detail: `victoria_source_manifest.json`)

## Sources selected

| dataset | publisher | grain | format | access |
|---|---|---|---|---|
| VPSR median house/unit/land by suburb (quarterly) | Dept. of Transport and Planning / Valuer-General Victoria | suburb | legacy `.xls` (OLE2/BIFF) | headed browser (Cloudflare) |
| VPSR yearly summary | same | LGA/state | legacy `.xls` | headed browser |
| Moving annual rent by suburb (quarterly, full history in one file) | Homes Victoria (DFFH) | suburb | modern `.xlsx` | direct, no protection |
| Quarterly median rent by LGA (fallback) | Homes Victoria (DFFH) | LGA | modern `.xlsx` | direct, no protection |
| ASGS geography, Census demographics/dwelling-stock/tenure, Building Approvals | ABS | SAL/POA/SA2/LGA | — | **already loaded nationally, no new work** |

## Bot protection finding and resolution

`www.land.vic.gov.au` (the VPSR file host) sits behind a Cloudflare managed
JS challenge — plain `curl` and default headless browser navigation both
return HTTP 403 / a "Just a moment..." challenge page. This is the same
category of protection NSW's `valuergeneral.nsw.gov.au` used in Sprint 5,
resolved the same way: a **headed** browser session (`gstack /browse
--headed`) that lets the challenge JavaScript execute and redirect
naturally — the same mechanism a real user's browser uses. This is
explicitly **not** CAPTCHA-solving, stealth fingerprint-spoofing, or proxy
rotation (all forbidden this sprint) — it's the standard headed mode already
established as this project's solution for an equivalent official-government
Cloudflare challenge. Verified: downloaded a genuine 233 KB OLE2 Compound
Document (confirmed via file-signature inspection), not another challenge
page.

`www.dffh.vic.gov.au` (the rental report host) has **no** bot protection —
direct headless download succeeded on the first attempt.

## File format finding

VPSR sales files are **legacy `.xls`** (OLE2/BIFF binary, Crystal
Reports export) — not modern `.xlsx` (OOXML). This project's existing
`exceljs` dependency cannot read this format. A parsing approach is
resolved in Phase 5 (the build script), not required for this discovery
phase.

## Efficiency finding: rental report is cumulative

Each quarterly "Moving annual rent by suburb" file contains the **full**
historical series back to March 2000 (233 columns = ~103 quarters ×
count+median pairs, across 7 dwelling-type/bedroom sheets) — only the
**latest** quarterly file needs downloading to get complete history, unlike
VPSR's per-quarter-only sales files.

## Missing-value convention confirmed at source

Small-sample/unavailable suburb-quarter cells in the rental file are marked
`"-"` (confirmed live, e.g. Docklands early quarters) — maps directly to
`NULL`, never zero-filled, matching this project's established convention
without any extra logic needed.

## Rejected sources

- **CAV RTBA raw bond microdata** — Homes Victoria's own published Rental
  Report already provides the same underlying data pre-aggregated with
  documented methodology; preferred over re-deriving it ourselves.
- **REIV median price data** — an industry association, not an official
  government/statutory authority; also feeds commercial portals.

## Already-present (no new work)

Victoria's ASGS geography, Census demographics/dwelling-stock/tenure, and
ABS Building Approvals data are **already loaded nationally** on the branch
(see `sprint10_existing_state_audit.md`) — confirmed via direct query, zero
new discovery or download needed.
