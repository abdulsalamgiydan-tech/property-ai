# Sprint 13 Workstream 1 — Vercel Access & Deployment Diagnosis

## Finding

The earlier Vercel MCP `403 Forbidden` is a **stale/invalid MCP connector
session token**, not a missing team/project entitlement, not a broken
deployment, and not evidence that the application fails to build.

## Evidence (no credentials printed)

1. `.vercel/project.json` (already committed) links this repo to:
   - `projectId: prj_DNWzAKwc9e4SbQODevzRrQl9kAAh`
   - `orgId: team_C9DDb5QQbFOdDkAMH76e8z3c`
   - `projectName: property-ai`
2. Calling the Vercel MCP `list_deployments` tool against that exact
   `projectId`/`teamId` returned:
   `403 ... "Not authorized: Trying to access resource under scope
   \"zeebusiness93-2304s-projects\""`. `list_teams` via the same MCP
   connector returned an empty list — the connector currently has no
   authenticated team at all.
3. Independently, the Vercel CLI (`npx vercel whoami`) also failed with
   "The specified token is not valid" using whatever token the CLI had
   cached — confirming this is a broken/expired session, not a
   permissions decision made by Vercel.
4. A fresh interactive login (`npx vercel teams ls`, which triggers
   `vercel login` when no valid session exists) completed a device-code
   OAuth flow and succeeded. After that:
   - `vercel teams ls` listed exactly one team:
     `zeebusiness93-2304s-projects — zeebusiness93-2304's projects`
     (matches the org ID in `.vercel/project.json`).
   - `vercel project ls` listed the `property-ai` project with production
     URL `https://app.propellect.com.au`.
   - `vercel ls` listed ~19 recent deployment URLs under that project.
   - `vercel env ls` listed 4 environment variable **names**
     (`ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`), all
     scoped to Preview + Production, all shown as "Encrypted" (no values
     retrieved or displayed).

So: the human/CLI identity behind this device-code login has full,
correct access to the right team and the right project. The Vercel MCP
connector inside Claude is simply authenticated as someone/something else
(or with an expired token) and needs its own re-authorization — it is a
separate credential store from the CLI session established in this shell.

## Gap found during diagnosis (not a blocker, but relevant to Workstream 19)

None of the warehouse/research feature-flag environment variables
(`WAREHOUSE_SUPABASE_URL`, `WAREHOUSE_SUPABASE_ANON_KEY`,
`WAREHOUSE_PREVIEW_ENABLED`, `MULTI_STATE_RESEARCH_ENABLED`,
`DATA_OPERATIONS_ENABLED`, `SCENARIO_LAB_ENABLED`,
`PUBLIC_API_V1_ENABLED`) are currently set in Vercel at all — only the
core Supabase/Anthropic/site-url vars are. This means any existing preview
deployment today serves the deal-tools product (analyse-property,
compare-properties, dashboard, watchlist, portfolio) but **not** the
`/research/*` surface, which will 404 by design until those flags are
added to the Preview environment. This is expected/safe default-off
behaviour, not a bug — but it means Workstream 19 cannot demonstrate the
research product on preview without adding these (validation-branch-scoped)
variables to Preview first, which requires explicit approval since it is a
shared-environment change.

## Minimal human action required (only for the MCP connector itself)

The CLI in this working environment is now authenticated and functional
for read-only diagnosis and Preview deployments — no human action is
required to continue Sprint 13's local/CLI-driven work.

To fix the **Vercel MCP tool** specifically (separate integration, only
needed if future sessions want to use `mcp__claude_ai_Vercel__*` tools
directly instead of the CLI):

1. Open Claude's connector/integration settings (wherever the Vercel MCP
   connector was originally installed/authorized).
2. Re-authorize/reconnect the Vercel integration, selecting the
   `zeebusiness93-2304's projects` team when prompted.
3. No project creation, transfer, or relinking is needed — the existing
   `property-ai` project is correct and untouched.

## Guardrails respected

- No project was created, duplicated, unlinked, or relinked.
- No secret values were printed; `vercel env ls` only surfaces variable
  names, scope, and "Encrypted" status.
- No deployment was promoted to Production; no Production env var was
  read, written, or referenced.
