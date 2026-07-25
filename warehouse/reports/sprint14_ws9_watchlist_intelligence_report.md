# Sprint 14 — Workstream 9: Watchlist & Change Intelligence v2

## Scope delivered this pass

Sprint 13 shipped watchlist change-detection covering sales price, rent,
yield, and approvals movements. This workstream extends that foundation
with two concrete, previously-missing pieces called out in the Sprint 14
brief:

1. **Transaction volume monitoring.** `sales_volume_12m` was captured in
   market snapshots but never diffed. `lib/warehouse/watchlistChanges.ts`
   now tracks it as a `sales_volume_movement` event, using the same
   noise-thresholded `movementEvent()` helper as the existing metrics
   (percentage-based significance, `absolute: false`). `SnapshotDiffInput`
   gained the field; `app/api/watchlist/refresh-changes/route.ts`'s
   `toDiffInput()` now maps it through from the stored snapshot.

2. **Digest preview (dry-run only, provider-neutral).**
   `lib/notifications/digestPreview.ts` is a pure function that builds a
   preview of what a future email/push digest *would* contain, from a
   user's own unread `watchlist_change_events`. It sends nothing — no
   email client, no push provider, no external call of any kind — per
   the guardrail against wiring real notification infrastructure without
   explicit approval. `lib/supabase/notificationPreferences.ts` adds
   get/set helpers against the existing `notification_preferences` table
   (created in Sprint 13 migration 039; no new migration needed here).
   `components/watchlist/WatchlistClient.tsx` wires this into a new
   "Digest preview" panel: a frequency selector (off/daily/weekly), a
   toggleable preview render, and an explicit on-screen disclaimer that
   nothing is actually sent.

3. **Manual "Check now" button.** The mount-time change-check effect was
   extracted into a reusable `loadChanges()` function so users can
   trigger an on-demand refresh instead of waiting for the next
   scheduled/background check. The "What changed?" panel now always
   renders once a user has any watchlist items (previously it only
   appeared after change events already existed), with an honest empty
   state ("No changes detected yet") rather than disappearing.

## Explicitly deferred (not implemented this pass)

The brief's fuller WS9 spec also mentions monitoring saved Scenario Lab
assumptions and previously-analysed property inputs for drift. Neither
was implemented in this pass — both would require new schema linking
scenario/analysis records to watchlist geographies and a materially
larger diffing surface, which is out of scope for a single focused
workstream. Stating this explicitly rather than implying broader
coverage than what shipped.

No real email/push delivery was built or wired — this remains a
deliberate product decision consistent with the "no new paid infra"
guardrail. The digest preference is stored and previewable, but nothing
downstream consumes it yet.

## Testing

- `lib/warehouse/watchlistChanges.test.ts`: +2 tests (sales volume
  movement detected; sub-threshold volume change correctly treated as
  noise).
- `lib/notifications/digestPreview.test.ts`: +7 tests (unread-only
  filtering, empty state, preview available even when frequency is
  "off", 20-item cap with accurate total count, pluralisation).
- `app/api/watchlist/refresh-changes/route.test.ts`: existing fixtures
  updated to include `sales_volume_12m` so the route's snapshot-mapping
  test coverage stays accurate to the real type shape.
- Full suite: 334/334 passing (up from 325 at the last checkpoint).
- `npx eslint components/watchlist/WatchlistClient.tsx`: clean. Hit and
  fixed one real `react-hooks/set-state-in-effect` violation — see
  commit for detail — by deferring the extracted `loadChanges()` call
  inside the mount effect with the same `setTimeout(fn, 0)` pattern
  already used elsewhere in this file for `dataLoading`.
- `npm run build`: passes.
- `npm run warehouse:check` / `npm run warehouse:rls:check`: both pass
  (run for consistency; this workstream added no new migration, so no
  schema drift was possible).

## Database changes

None. This workstream is entirely application-layer, reusing the
`notification_preferences` table and `watchlist_change_events` table
that already exist and are already covered by the RLS checker (both
show green above with full CRUD-appropriate policy coverage).

## Risk / correctness notes

- The digest preview's "unread" filter is client-computed from data the
  user is already authorised to read via existing RLS-protected queries
  (`watchlist_change_events` select policy scopes to the owning user) —
  no new data-exposure surface introduced.
- `sales_volume_12m` diffing uses the same significance-threshold logic
  already proven for the other three metrics, so no new noise-tuning
  risk beyond what Sprint 13 already validated.
