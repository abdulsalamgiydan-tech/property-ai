# Sprint 13 — Private-Beta Operating Pack (Workstream 20)

## Supported jurisdictions and metrics (current, from `warehouse/config/jurisdiction_coverage.yml`)

| Jurisdiction | Sales | Rent | Yield | Dwelling stock/approvals/demographics/population growth |
|---|---|---|---|---|
| NSW | Full, transaction-level | Full | Derived | Full |
| VIC | Partial (VPSR, quarterly summary, no SAL/POA split) | Snapshot only, no time series | Derived | Full |
| QLD, SA, WA | Unavailable (paid/restricted sources) | Available | Unavailable (needs sales) | Full |
| TAS, ACT, NT | GCCSA-grain only, no SAL/POA | Unavailable | Unavailable | Full |

Land values, vacancy rate, and planning pipeline: unavailable everywhere
— no free official bulk source identified for any of the three, in any
jurisdiction. This is an honest, documented national gap.

## Data freshness matrix

See the live `/research/data-status` console (gated
`WAREHOUSE_PREVIEW_ENABLED` + `DATA_OPERATIONS_ENABLED`) for current
per-dataset status, latest source period, last retrieval/validation
timestamps, and manual-action guidance — this is the authoritative,
always-current source, not a static snapshot in this document.

## Test plan / UAT checklist for private-beta testers

- [ ] Search a suburb by name (NSW and VIC) — suggestions appear, state
      badge correct, keyboard nav works
- [ ] Search a postcode
- [ ] Search a duplicate suburb name across states (e.g. "Richmond") —
      both results appear with distinct state badges
- [ ] Open a suburb profile — median price/rent/yield/confidence render;
      missing metrics show "Unavailable", never $0
- [ ] Open "About this metric" on at least 3 different metric families
- [ ] Compare 3+ areas across NSW and VIC — reorder columns, confirm
      the URL updates and is shareable
- [ ] Export a comparison as CSV, JSON, and print
- [ ] Analyse a property in NSW/VIC — confirm suburb suggestions apply;
      analyse a property in another state — confirm the "not covered
      yet" message appears rather than nothing happening
- [ ] Open Scenario Lab for a suburb — adjust all 3 default cases, add a
      4th, remove one
- [ ] Download a Scenario Lab investment-research report (CSV/JSON/print)
- [ ] Sign in, save a scenario, sign out, sign back in, confirm it's
      still there
- [ ] Add a suburb to your watchlist via search (geography-linked) and
      via free text (any state) — confirm both work
- [ ] Revisit your watchlist later — confirm the "What changed?" panel
      reflects real detected changes, not a canned example
- [ ] Attempt to access another user's saved data via the browser
      devtools/network tab directly — confirm it's rejected (RLS)
- [ ] Try the app on a phone-sized viewport — confirm the bottom nav and
      Scenario Lab cards are usable

## Known limitations (see also `sprint13_phase1_final_report.md` and
`sprint13_phase2_security_report.md` for the full itemised list)

- Live cross-user RLS testing is static-only this sprint (no safe
  non-production branch exists for the main app schema).
- Comparison's historical/trend-over-time view is not built yet
  (snapshot comparison only).
- Rate limiting on new API routes is best-effort/single-instance, not
  distributed — a burst across multiple serverless instances isn't
  fully bounded.
- Entitlement tiers (Free/Research/Investor Pro/Professional) are schema
  only — nothing is actually gated by tier yet, and there's no billing.
- Watchlist change detection runs on-demand (when you visit your
  watchlist), not on a schedule — there's no background job.
- Notification preferences exist as a data model only; no email/SMS/push
  is ever sent by this codebase.

## Incident response (data/warehouse issues)

1. Check `/research/data-status` for the affected dataset's status and
   "manual action required" hint.
2. Check `warehouse/reports/*_incident*` / run
   `npm run warehouse:incidents` for a structured incident summary.
3. If a dataset shows `validation_failed` or `failed`: do not promote to
   the branch; investigate via the referenced build/validate script logs.
4. If user-facing data looks wrong on a specific page: check the
   metric's confidence label and source period first — an "unavailable"
   or "insufficient" label is often the honest, correct answer, not a bug.

## Rollback procedure

- **Code**: this entire sprint lives on `feature/sprint13-private-beta`,
  never merged to `main`. Rollback is "don't merge / revert the merge
  commit if one was made" — no production deploy has occurred, so there
  is nothing live to roll back from a user-facing perspective.
- **Database**: every migration this sprint (037-040) is additive only
  (new tables/columns, no `DROP`/`TRUNCATE`/`DELETE`) — verified by
  `warehouse:check`'s destructive-DDL scan on every commit. Rollback is
  "stop using the new tables/columns," not a down-migration.
- **Preview deployment**: can be deleted via `vercel remove` or simply
  superseded by a newer deploy; it was never promoted to production.
- **Vercel env vars**: the 7 new vars are scoped to the
  `feature/sprint13-private-beta` branch's Preview environment only —
  removing them (`vercel env rm <name> preview feature/sprint13-private-beta`)
  fully reverses this sprint's only production-adjacent change.

## Cost estimate

See `sprint13_cost_model.md` (Workstream 14) — measured figures (branch
storage, query bounding, timing) vs. assumed figures (dollar estimates at
100/1,000/10,000 MAU) are clearly separated there.

## Security summary

See `sprint13_phase1_security_report.md` and
`sprint13_phase2_security_report.md` for the full writeups. Headline: RLS
verified on all 10 `public.*` tables (static check, `warehouse:rls:check`),
CSV/formula injection fixed in both export paths, best-effort rate
limiting added to the 3 newest API routes, Next.js upgraded to fix 4
real CVEs (SSRF, cache confusion, unbounded payload, unauthenticated
endpoint disclosure), bundle/secret scan clean.

## User-feedback template (for private-beta testers)

```
Page/feature: 
What were you trying to do?: 
What happened?: 
What did you expect instead?: 
Screenshot/URL (if applicable): 
Browser/device: 
Severity (blocker / annoying / minor / suggestion): 
```

## Beta invitation copy (draft — not sent, per guardrail)

> Subject: You're in — Propellect private beta
>
> Propellect now includes national suburb and postcode research: search,
> compare across states, model investment scenarios, and track saved
> areas — alongside the property analysis tools you already know.
>
> This is a private beta. Data is real (ABS, state government sources),
> but coverage varies by state and the product is still evolving —
> you'll see confidence labels and "Unavailable" on plenty of numbers,
> and that's intentional honesty, not a bug.
>
> Nothing here is financial, tax or legal advice, and nothing is a
> forecast or a recommendation — it's research and decision support.
>
> [Get started] — feedback welcome any time via [feedback link].

## Go/no-go checklist for actually inviting beta users

- [ ] Product owner has manually completed the UAT checklist above
      against the live preview URL
- [ ] Explicit decision made on Workstream 11's entitlement
      tiers (even "everyone stays free tier for beta" is a decision to
      make consciously, not by default)
- [ ] Explicit decision made on whether `DATA_OPERATIONS_ENABLED` stays
      on for beta users (currently enabled on preview for testing
      convenience — recommend disabling for real beta users, since it's
      an internal-facing console)
- [ ] Confirmed who receives/monitors user feedback
- [ ] Confirmed a support/incident contact path exists
- [ ] Explicit approval given for the actual production deploy (never
      done automatically by this or any future autonomous session per
      the standing guardrail)
