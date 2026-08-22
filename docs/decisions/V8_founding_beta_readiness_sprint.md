# V8 founding beta — readiness sprint handoff

Date: 22 August 2026

Branch: `feature/v8-founding-beta-readiness`

Production activation: **not included**

## Outcome

This change set prepares the invite-only founding-beta experience for a small reviewed cohort while preserving the current dark launch state. Merging the code does not enable Deal Hunter or Bring Your Own Deal: access still requires the existing warehouse flag, the founding-beta flag and an exact allowlist match.

## Included

1. **Authenticated homepage action** — the hero now resolves auth state at a small client boundary. Signed-in users see **Open my dashboard**; signed-out users open the existing sign-in flow; the loading state does not flash a false sign-in prompt.
2. **Guided buy-box prerequisite** — Deal Hunter and Bring Your Own Deal share a clear two-step empty state with a direct route to save a Find My Investment profile and return.
3. **Privacy-safe measurement contract** — founding-beta funnel events use categorical fields, booleans and bounded counts only. The contract forbids identity, address, listing key, URL, free text, token and auth-session data. The existing analytics seam remains a Production no-op until a provider is separately approved.
4. **Read-only internal readiness view** — the already gated `/admin` route now shows the three launch controls and the number of valid cohort identities. It never renders raw allowlist entries or environment values and cannot change configuration.

## Explicitly not included

- No Production or Preview environment-variable change.
- No founding-beta flag activation or cohort population.
- No Vercel deployment, Supabase write, migration or data change.
- No user invitation, provider contact or other outreach.
- No new analytics provider or session-recording tool.
- No weakening of page, API or RLS gates.

## Verification completed locally

| Gate | Result |
|---|---|
| Targeted readiness tests | 13 passed |
| Full Vitest suite | 958 passed, 8 skipped, 0 failed |
| ESLint | 0 errors; 9 pre-existing warnings elsewhere |
| Shipping-source TypeScript | Passed |
| Next.js Production build | Passed; 54 pages generated |
| RLS policy coverage | Passed; all 21 public tables covered or explicitly documented |
| Warehouse skeleton/integrity | Passed |
| Secret scan | Passed across tracked source, built output and source maps |

## Preview review checklist

Use an isolated Preview deployment only.

- Signed out on `/`: the hero action opens the existing authentication modal.
- Signed in on `/`: the hero action reads **Open my dashboard** and routes to `/dashboard`.
- Invited tester with no saved profile: `/deal-hunter` and `/byod` show the guided buy-box prerequisite.
- After saving a profile: returning to each beta surface continues into the normal deal flow.
- Allowlisted admin with internal operations enabled: `/admin` shows only launch-control booleans and a cohort count.
- Non-admin, signed-out and disabled-internal-operations requests to `/admin` remain fail-closed.
- No browser console error, hydration warning or personal data in analytics debug output.

## Activation remains a separate approval

The founding beta stays dark until Abdul separately approves an invitation wave and the controlled environment workflow sets the founding-beta flag plus the final restricted allowlist. That approval must include the intended cohort size, support coverage and rollback owner.
