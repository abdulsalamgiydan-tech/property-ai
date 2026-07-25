# Sprint 14 — Workstreams 3/4: Discovery v2 / Area Intelligence v2 Polish

## Scope investigated, and why "national discovery" was NOT attempted

Before writing any code, I checked whether the underlying warehouse data
actually supports the brief's aspirational "national discovery" framing
beyond the NSW/VIC coverage the Explore UI currently exposes.
`warehouse/scripts/audit/build_national_coverage_registry.mjs` (an
existing, already-run audit from Sprint 12) documents real, unresolved
data-quality gaps that make widening state filtering beyond NSW/VIC a
genuine data-engineering task, not a UI polish item:

- `mart.postcode_market_snapshot`'s `jurisdiction` column is only
  populated for NSW/VIC — QLD/SA/WA postcode rows have no jurisdiction
  label at all in that table.
- `core.dim_geography.state_code` is NULL for all current POA
  (postcode) rows at the boundary-file level — a naive join from any
  fact table to `state_code` silently drops every postcode-grain fact
  from a per-jurisdiction filter.
- `core.fact_rental_market_summary` has zero rows for VIC across every
  geography type; VIC's rent exists only as a single latest-value
  column with no time series, unlike every other rent-bearing
  jurisdiction.

The audit itself flags these as "candidate for Sprint 12 WS6 (national
canonical marts) to fix structurally." Attempting to widen the
`jurisdiction: "NSW" | "VIC"` type across `lib/warehouse/queries.ts`,
the `search_market_geographies_v2` RPC, and the Explore/Compare UI in
one bounded polish pass would either (a) surface incomplete/mislabelled
data as if it were reliable, or (b) require fixing the underlying marts
first — a substantially larger effort than this workstream's scope.
This matches the execution plan's own classification of WS3/WS4 as the
lowest-priority Tier 3 item ("largely incremental UI polish... lower
priority than genuinely new capability") — stated honestly here rather
than either attempting a rushed, data-quality-risking expansion or
silently skipping the workstream.

## What was delivered instead: real, low-risk discovery UX polish

Two concrete improvements to the existing Explore flow, both purely
client-side display transforms over data the warehouse already returns
— no new query, no new data-layer risk:

1. **Sort control on Explore results** (`lib/research/exploreSort.ts`,
   `sortExploreResults()`). Two modes: "Has market data first" (default
   — groups geographies with a suburb/postcode snapshot ahead of those
   without, so a browsing user sees productive results first, without
   changing which results are shown) and "Name (A-Z)". The "data
   first" grouping is a stable sort — it never reorders within a group,
   only regroups. Wired into `ExploreResultsList.tsx` as a `<select>`.
2. **"Clear all filters" link on the empty-results state**
   (`app/research/explore/page.tsx`). Previously the empty state's copy
   told a user to "clear the state/type filters" but gave them no way
   to do it in one click. `components/design/EmptyState.tsx` gained a
   new, purely additive `linkHref`/`linkLabel` prop pair (a plain
   `next/link`, safe to use from a server component — unlike the
   existing `ctaLabel`/`onCtaClick`, which requires a client-component
   caller) and the Explore page now shows the link only when a query,
   state, or type filter is actually active.

## Testing

- `lib/research/exploreSort.test.ts` (new): 5 tests — "name" sorts
  alphabetically regardless of data availability; "data_first" groups
  correctly; "data_first" is verified stable (preserves original
  relative order within each group); output length always matches
  input length (never drops/duplicates); the function never mutates
  its input.
- Full suite: 401/401 passing (up from 396 after WS2).
- `npx eslint` across every new/modified file: clean.
- `npm run build`: passes.
- `npm run warehouse:check` / `npm run warehouse:rls:check`: both pass
  (no schema changes in this workstream).
- **Live browser verification** (via the `browse` tool, dev server,
  with `WAREHOUSE_PREVIEW_ENABLED`/`MULTI_STATE_RESEARCH_ENABLED` on
  locally): the sort `<select>` renders and accepts both options
  without error; searching a nonsense query with an active state filter
  correctly shows the empty state with a working "Clear all filters →"
  link that resets the URL to `/research/explore` with no query params.
  Incidentally, this live check visually confirmed the audit's finding
  above — postcode results starting with `08xx` (Northern Territory)
  are already returned by the search with `has_postcode_snapshot: true`
  ("view →"), i.e. real non-NSW/VIC data already exists in the
  warehouse but isn't reliably jurisdiction-labelled, exactly matching
  the audit's documented gap.

## What was deliberately not done

- No widening of state/jurisdiction filtering beyond NSW/VIC (see
  above — this requires warehouse mart fixes, not UI work).
- No pagination beyond the existing 50-result cap — not attempted this
  pass; the sort control at least surfaces the more useful results
  first within that cap.
- No changes to `/research/compare` or `MarketMapExplorer.tsx` — both
  were reviewed and found already reasonably polished (working
  multi-select, working compare-table rendering); no clear, bounded
  improvement was identified there in the time available for this
  workstream.

## Database changes

None.
