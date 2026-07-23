# Sprint 13 — Resume or Launch Decision

## What's complete

Workstreams 0, 1, and 2 through 21 of the original 21-workstream Sprint
13 brief are all done — every commit checkpointed, tested, and pushed to
`feature/sprint13-private-beta`. This is the full sprint, not a partial
phase (Phase 1 = WS2-8, Phase 2 = WS9-21, both complete).

## Three paths from here

**1. Launch (invite real beta users)**
Requires working through `sprint13_operating_pack.md`'s Go/No-Go
checklist first — specifically: someone manually completing the UAT
checklist against the live preview URL (SSO-gated, needs your own
Vercel-authenticated browser), an explicit decision on entitlement tiers
for beta users, an explicit decision on `DATA_OPERATIONS_ENABLED` for
real users, and — separately, explicitly, later — approval for an actual
production *deployment* (not just the database migrations already
applied; the application code itself is still only on a preview
deployment, never promoted to production).

**2. Merge to `main` first, defer the beta launch**
`feature/sprint13-private-beta` is 117 commits ahead of `main` — a
squash-or-regular merge would need your explicit review and approval per
the standing guardrail (never done automatically). This is a reasonable
middle step if you want the code in `main` before deciding on beta timing.

**3. Continue further engineering**
Genuine remaining opportunities, roughly in priority order: comparison's
historical/trend view (deferred in WS7), a fuller entitlement enforcement
pass (WS11 built the schema, nothing is actually gated yet), live
cross-user RLS testing (needs a decision on provisioning a safe
non-production branch for the main app schema), and a full accessibility
audit of pre-existing (non-Sprint-13) product surfaces.

## What I will not do without further explicit instruction

- Merge to `main`.
- Promote the preview deployment to production (`vercel deploy --prod`).
- Apply any further database change to production without asking again
  at the time.
- Send any beta invitation (the draft copy in the operating pack is
  unsent).
- Enable billing/payment on the entitlement schema.

## Recommendation

Given the scope already covered and the genuine judgement calls involved
in "who gets invited and when," this is a natural stopping point for
autonomous work. The next step is a human decision (which of the 3 paths
above), not more code.
