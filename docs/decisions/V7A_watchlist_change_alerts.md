# V7A — Watchlist + change-alerts on shortlisted suburbs (Sprint C slice)

**Status:** built on an isolated worktree branched from `origin/main` (f20816b, the V6D
merge). **Production and the live V6D SA beta are untouched.** The DB migration is
**DRAFTED, not applied** — it needs separate human approval like every 056–061 migration.

## Customer outcome
A signed-in user gets a plain-English, **sourced** alert when the official evidence
behind a **shortlisted SA suburb** changes (e.g. 12-month growth or yield moves), or a
trust signal when a metric goes missing/stale. AI narrates deterministic engine output;
it never emits a figure or a recommendation.

## What shipped in this slice (maps to roadmap C1–C5)

| WP | Deliverable | Files |
|----|-------------|-------|
| **C1** | Additive migration: `investment_shortlist_change_events` (RLS, same-user **and must-be-shortlisted** composite FK) + `investment_notification_prefs` + least-privilege SECURITY DEFINER detector. **Draft only.** | `supabase/migrations/062_shortlist_change_events.sql` |
| **C2/C3** | Deterministic detector + provenance-mapped explainer (pure functions; missing/stale → confidence event, never a fabricated value). | `lib/opportunity/changes.ts` |
| **C4** | Alerts API (`POST` detect / `GET` read+explain / `PATCH` mark-seen) + preferences API + a flag-gated UI panel on `/find-investment`. | `app/api/investment/changes/route.ts`, `app/api/investment/prefs/route.ts`, `components/find-investment/ChangeAlerts.tsx` (+ wiring in `FindInvestmentClient.tsx`) |
| **C5** | Tests: PGlite static+applied on 062; detector/explainer determinism + provenance; API auth/fail-closed. | `*.test.ts` alongside each |

## Security model (mirrors 059/061)
- **anon/PUBLIC:** no access to either new user table.
- **authenticated:** `SELECT` + `UPDATE` (mark seen) + `DELETE` (dismiss) on events — **no INSERT**; events are only ever written by the SECURITY DEFINER detector, so a client cannot forge an alert. Full DML on prefs. **RLS gates every row to `auth.uid() = user_id`.**
- **Detector:** `SECURITY DEFINER`, pinned `search_path`, `EXECUTE` to `authenticated` only; scoped to the caller's own shortlisted suburbs; idempotent (`ON CONFLICT DO NOTHING`).
- **Same-user + must-be-shortlisted:** composite FK `(user_id, geography_id) → investment_shortlist_items(user_id, geography_id) ON DELETE CASCADE`. Un-shortlisting a suburb clears its alerts.

## Never-fabricate guarantees (tested)
- A value change is recorded **only** when the official `period_end` advances (a genuine refresh) — same/older period is ignored.
- A missing/stale mandatory metric produces a **confidence** event with `new_value = null`; the last-known value is shown as context, never re-presented as current.
- Every surfaced figure carries its provenance (`source_id · period` + attribution). Explainer strings contain no "should/recommend/forecast" language (asserted in tests).

## Scope boundary / honest follow-ups
- The **v1 SQL detector** records value-advance events. **Confidence events** (missing/stale) are produced by the deterministic application-layer detector and stored in the same table (the partial unique index keeps one open confidence row per metric). Folding confidence detection into the RPC is a documented **v2** follow-up.
- No scheduler yet: `POST /api/investment/changes` runs detection on demand (the UI triggers it). A per-user cron is the natural next step (V6E instrumentation cadence).
- SA official metrics only. No new states, no property-level data, no auto-actions (V8/V9/V10 gates unchanged).

## Verification
- `npx vitest run` → **109 files / 847 passed, 8 pre-existing skips.** New: `062` (13), `changes` lib (8), `changes` route (8).
- `npx eslint` on the new source files → clean. New files add **no** `tsc` errors (pre-existing `warehouse/scripts/**` test-file errors are unrelated and present on the base).
- `npm run warehouse:rls:check` → **pass** (added `investment_shortlist_change_events` to `KNOWN_EXCEPTIONS`: no INSERT policy/privilege is deliberate — definer-only writer). `npm run security:secrets:check` → pass.

## Adversarial review (checkpoint) — 8 properties proven
1. **Prefs first-write (create, not just update):** a first-time `authenticated` user INSERTs their own prefs row under RLS (062 test, `set role authenticated`).
2. **Grants match the first-write path:** prefs = full DML to `authenticated`; events = SELECT/UPDATE/DELETE only (no INSERT). Proven via `has_table_privilege` + role tests.
3. **Users cannot forge events:** direct client INSERT into the events table is refused even for one's own shortlisted suburb (no privilege, no policy).
4. **SECURITY DEFINER correctness:** `security definer`, pinned `search_path 'public','core','mart'`, all object refs schema-qualified, `revoke all from public` + `grant execute to authenticated`.
5. **Composite FK + cascade intentional:** `(user_id, geography_id) → investment_shortlist_items ON DELETE CASCADE`; FK blocks an event for a non-shortlisted suburb; un-shortlisting clears alerts.
6. **Mutation routes fail closed:** `PATCH /changes` returns 404 on zero affected rows; `prefs` is an idempotent self-upsert (RLS violation throws, never silent success).
7. **UI flag-gated:** double-gated — page `notFound()` when the warehouse-preview flag is off, and every API route 404s when off.
8. **062 applied nowhere remote:** header marks it PREPARED/NOT APPLIED; the only execution is disposable in-memory PGlite tests; no `apply_migration`/ledger reference exists.

The review found **no code defects** — the checkpoint added proof coverage (4 RLS-role tests) and a documented RLS-checker exception; it did not change the feature's behaviour.

## Do NOT (gates)
- Do not apply migration 062 to validation or Production without separate approval.
- Do not enable the UI in Production by flipping the flag false→true here — the whole feature stays behind the existing `WAREHOUSE_PREVIEW_ENABLED` gate, shared with `/find-investment` and `/research`.
