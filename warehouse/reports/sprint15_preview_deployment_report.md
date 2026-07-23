# Sprint 15 — Preview Deployment Report

## Status: blocked on a genuine credential gate

A Vercel Preview deployment for `feature/sprint14-production-readiness`
was **not** created this session. This is being reported honestly as a
blocker, not silently skipped or worked around.

## What was attempted

1. **`mcp__claude_ai_Vercel__*` tools** (the pre-connected Claude.ai
   Vercel integration): `list_teams` returned an empty list, and
   `get_project` against this repo's actual linked project
   (`prj_DNWzAKwc9e4SbQODevzRrQl9kAAh`, org
   `team_C9DDb5QQbFOdDkAMH76e8z3c` — read directly from
   `.vercel/project.json`, not guessed) returned `403 Forbidden`. This
   integration is connected to a different, unrelated Vercel account
   than the one that owns this project.
2. **`mcp__plugin_vercel_vercel__*` tools**: require a fresh OAuth
   authorization. Calling `authenticate` returned a real Vercel OAuth
   URL requiring the project owner to complete the flow in their own
   browser — this cannot be completed autonomously.
3. **Vercel CLI**: not installed in this environment (confirmed via
   the session's own tooling notices at startup).

This was flagged to the user mid-session as a genuine credential gate,
per this sprint's own instruction to stop only for exactly this kind
of blocker, rather than working around it (e.g., by fabricating deploy
output or skipping the requirement silently).

## What this blocks

- Live UAT of the deployed preview at a real URL with real signed-in
  browser sessions.
- Bundle inspection of the actual Vercel-built output (a local
  production build was inspected instead — see
  `sprint15_security_report.md` — which is a legitimate, close proxy
  since Vercel's Next.js build pipeline produces materially the same
  client bundle, but is not identical to what Vercel's own build
  environment would produce).
- Configuring `RESEARCH_COPILOT_ENABLED`, `SUPABASE_SERVICE_ROLE_KEY`,
  and `ADMIN_EMAILS` in an actual Vercel Preview environment (the
  values and their intended defaults are fully specified in
  `sprint15_production_runbook.md` and `.env.example`, ready to apply
  the moment Vercel access exists).

## What was done instead, to make genuine progress despite the blocker

Rather than stop all forward progress, authenticated UAT was performed
against a **real, non-production database** with **real Supabase auth
users** — see `sprint15_authenticated_uat_report.md` for full detail.
This is not a full substitute for live browser testing against a
deployed preview (application-layer behaviour like rate limiting,
client-side rendering, and the actual UI flows were not exercised this
way), but it does rigorously prove the database-level security
boundary — RLS policies, tier-enforcement triggers, and cross-user
isolation — which is the layer that matters most for "can user A see
or write user B's data" and "can a user bypass their tier limit,"
independent of whatever UI sits on top.

## Unblocking this

Either of the following resolves the blocker:
1. Open the OAuth URL provided during this session (or re-request it —
   `mcp__plugin_vercel_vercel__authenticate` can be called again) and
   complete authorization in a browser signed into the Vercel account
   that owns `team_C9DDb5QQbFOdDkAMH76e8z3c`.
2. Install the Vercel CLI (`npm i -g vercel`) and run `vercel login`
   in this environment.

Once either is done, the remaining preview-deployment and full
browser-based UAT steps can proceed using the exact configuration
already specified in `sprint15_production_runbook.md`.
