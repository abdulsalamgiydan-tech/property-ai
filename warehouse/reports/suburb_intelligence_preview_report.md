# Suburb Intelligence Preview Report (Sprint 9, Phases 10-11)

Generated: 2026-07-21 (full detail: `suburb_intelligence_preview_report.json`)

## Routes created

`/research`, `/research/suburb/[geographyCode]`, `/research/postcode/[geographyCode]` —
gated behind `WAREHOUSE_PREVIEW_ENABLED` (unset = disabled by default, `notFound()`).

## Build and test results

- `npm run build`: success, all 3 routes registered as dynamic (server-rendered).
- `npm test`: **35/35 passed** — 17 new affordability-formula tests, 5 new
  feature-flag/config tests, plus the pre-existing 13 tests unaffected.

## Live UI verification (gstack `/browse`, headless Chromium)

Tested against `npm run dev` with the flag enabled: landing page, suburb search
with real disambiguation (4 Parramatta matches), and a full suburb snapshot page
(Parramatta, SAL 13167) — all 7 required sections render with real branch data,
confidence badges on every metric, "Unavailable" (not zero) for missing values,
plain-text affordability assumptions, and no buy/pass/score/forecast language
anywhere.

## Bugs found and fixed during live testing

1. **Illegible page** — the layout had no dark-background wrapper (relied on a
   `prefers-color-scheme` media query headless Chromium doesn't set). Fixed by
   reusing the same dark gradient as `AppShell`.
2. **Raw state codes** — showed ASGS numeric `"1"` instead of `"NSW"`. Added
   `lib/warehouse/stateCode.ts`.
3. **Oversized sales trend table** — `mart.suburb_sales_monthly` turned out to
   hold full 1996-2026 history on the branch, not the trailing-12-months this
   sprint's capacity plan assumed from Sprint 7's documentation. Fixed with a
   client-side recency filter (`lib/warehouse/queries.ts`) plus an explicit
   date filter in the branch loader for future runs. Rows already promoted by
   the run that predates this fix cannot be retroactively removed — DELETE is
   forbidden by this sprint's hard rules — so this is disclosed here rather
   than hidden.

## Secret-bundle check

Grepped the built `.next/static` client bundle for the Anthropic API key, the
literal database password, `WAREHOUSE_VALIDATION_DB_URL`, and even the
warehouse anon key/URL (non-secret, but intended to stay server-only). **Zero
matches for all patterns.**

## Design reuse

Reused `SectionCard`, `MetricCard`, `EmptyState`, `DisclaimerFooter` as-is. A
**new** `ConfidenceBadge` component was built instead of reusing
`StatusBadge` (which encodes green/amber/red "DealStatus" buy/pass semantics)
— reusing it would risk implying an investment signal, which this sprint
explicitly forbids.

## Production safety

- Flag-absent behaviour (`notFound()`) unit-tested (5 tests).
- No `service_role` key used anywhere.
- A separate `lib/warehouse/client.ts` — the production app's existing
  Supabase wiring (`lib/supabase/{client,server}.ts`) is never touched or
  reused for this feature.
