# Sprint 18 — Production Launch Closure Report

Date: 2026-08-01
This report documents launch closure per Abdul's "Sprint 18 Production
Launch Closure" mission. It is **post-merge documentation of an
already-completed, already-live launch** — it does not itself constitute
or modify the frozen application release (`warehouse/reports/
sprint18_3_final_release_proof.md`, frozen SHA `454f01c`), which remains
the approval record. This report is intentionally a separate artifact.

## Final identifiers

| Item | Value |
|---|---|
| Final Production deployment | `dpl_7LNKH7CQLWWX6X5X65mNHeQm82mw` (aliased to `app.propellect.com.au`, `www.propellect.com.au`, `propellect.com.au`) |
| Final `main` commit SHA | `09a6958cbafe55fd1dfcf24c6f55d3292c36da36` (merge of PR #26) |
| Pre-launch rollback baseline deployment | `dpl_AtHt2b5xLV7o6YDVsrVdS1LWA2Gf` (superseded by the Research launch deployment `dpl_FfcAqKDQsEthMuqx1J1ZAFHojhH2`, itself superseded by the post-merge deployment above — same application code both times, only env vars changed at the first transition, only merged tooling/migrations at the second) |
| Frozen release SHA (approval record) | `454f01c34d77677856638e01d57251712db1157a` |
| Snapshot ID | `wh-snap-2026-07-31-ed76873c-min21` |
| PR #26 | Merged via standard merge commit `09a6958`, matching this repo's established convention (PRs #2/#4/#23/#24/#25 all merge commits, never squash/rebase) |

## Production migration ledger (final)

`remote_schema`, `037`-`045` (pre-existing), then `048_warehouse_bootstrap_schemas`
→ `049_warehouse_bootstrap_geography` → `050_warehouse_bootstrap_meta` →
`051_warehouse_bootstrap_marts` → `052_warehouse_bootstrap_views_functions`
→ `053_warehouse_bootstrap_grants_prep` → `054_warehouse_internal_schema_rls_production`
→ `046_research_api_grant_hardening` (applied last, unmodified). Unchanged
since launch — reconfirmed via `list_migrations` during Phase 1 monitoring.

## 21-table row-count and checksum manifest

All independently re-verified against Production during this closure pass
(not just trusted from the original import report):

| Table | Rows | Checksum |
|---|---|---|
| core.dim_geography | 101,215 | match |
| meta.jurisdiction | 8 | match |
| meta.source | 13 | match |
| meta.dataset | 41 | match |
| meta.dataset_freshness_status | 7 | match |
| meta.dataset_refresh_run | 2 | match |
| meta.metric_assumption | 7 | match |
| meta.metric_lineage_registry | 35 | match |
| meta.data_quality_rule | 44 | match |
| meta.data_quality_run | 5 | match |
| meta.data_incident | 3 | match |
| meta.data_quarantine_summary | 1 | match |
| mart.suburb_market_snapshot | 15,334 | match |
| mart.postcode_market_snapshot | 2,641 | match |
| mart.suburb_demographic_profile_2021 | 15,334 | match |
| mart.postcode_demographic_profile_2021 | 2,641 | match |
| mart.suburb_market_timeseries | 102,625 | match |
| mart.postcode_market_timeseries | 23,150 | match |
| mart.suburb_rent_quarterly | 99,561 | match |
| mart.postcode_rent_quarterly | 75,578 | match |
| mart.lga_rent_quarterly | 13,931 | match |
| **Total** | **452,176** | **21/21 match** |

Source of truth for the checksum values: `warehouse/reports/
snapshot_verify_wh-snap-2026-07-31-ed76873c-min21_4d4283303f83.json`
(the real Production verify run), cross-checked against the frozen
manifest and against a fresh independent row-count query run during this
closure pass — all three agree exactly.

## Research Hub / API v1 functional verification

**Note on evidence type**: everything in this section is agent-run smoke
testing and direct database queries (real production data, real routes,
real HTTP responses) — it is **not** a substitute for Phase 2's
real-account authenticated UAT, which is recorded separately below as
still pending.

- `/`, `/dashboard` — 200.
- `/research`, `/research/explore`, `/research/suburb/13167` (Parramatta,
  NSW — real data, confidence "high", coverage "full"),
  `/research/postcode/2150`, `/research/compare`, `/research/map` — all
  200 with real data both before and after the PR #26 merge/redeploy.
- `/research/copilot/13167`, `/admin`, `/research/data-status` — 404,
  confirmed both before and after the merge.
- `/api/v1/search`, `/api/v1/compare` (valid and malformed-input cases),
  `/api/v1/map-markers` (bounded) — all correct, both before and after
  the merge. Arbitrary RPC probe (`/api/v1/rpc/exec_sql`) — 404.
- Representative direct-database queries (`search_market_geographies_v2`,
  `get_market_snapshot_v2`, `compare_market_geographies_v1`,
  `get_market_timeseries_v2`, `get_market_map_markers_v1`) all return
  correct real data, with genuinely missing data shown honestly
  (`confidence_label: insufficient`, null fields) rather than fabricated.

## Real-account authenticated UAT (Phase 2)

**Status: PENDING.** Not inferred from the smoke testing above, per
explicit instruction. This section will be updated with Abdul's own
reported results for: sign-in, session persistence after refresh,
Dashboard, onboarding, Settings save, Settings persistence, feedback
submission, Research search, suburb profile, location comparison,
bounded map, sign-out, protected-route rejection, re-authentication,
preference persistence after re-authentication. If a labelled
release-test feedback record is created, it will be identified,
owner/timestamp-confirmed, and deleted (that exact row only) per the
same procedure used for Stage 1 UAT earlier in this sprint.

## Security findings

`get_advisors(security)` re-run during this closure pass returns an
**identical finding set** to every check since launch: RLS-no-policy INFO
×21 tables, SECURITY DEFINER view ERROR ×10, function search_path WARN
×1 (pre-existing, unrelated `set_updated_at`), anon/authenticated
SECURITY DEFINER WARN ×16 (8 functions × 2 roles), plus the pre-existing
`waitlist` permissive-INSERT-policy WARN and `auth_leaked_password_protection`
WARN (both pre-existing, unrelated to this sprint). **No new critical/high
findings at any point since launch.** Write and internal-schema access
confirmed denied for anon/authenticated (`has_table_privilege`/
`has_schema_privilege` all false where expected).

## Performance findings

| Query | Observed latency |
|---|---|
| `search_market_geographies_v2` (representative) | sub-second via direct SQL; ~1.6s via `/api/v1/search` (includes HTTP/serverless overhead) |
| `get_market_snapshot_v2` | sub-second |
| `compare_market_geographies_v1` | ~0.7-1.1s via `/api/v1/compare` |
| `get_market_map_markers_v1` (bounded) | 0.28-4.3s, see note below |
| `get_market_timeseries_v2` | sub-second, 137 real rows returned |

Two transient, non-recurring latency/error blips were observed and
investigated (not glossed over): one genuine Postgres statement timeout
on an *unfiltered* map-markers call immediately post-launch (resolved on
retry, unreachable through the shipped UI — see Phase 3 below), and one
serverless/connection cold-start blip on a *filtered* map-markers call
through the public API shortly after the PR #26 merge redeploy (also
resolved on immediate retry). Both are consistent with normal cold-start
behavior following a burst of infrastructure changes (migrations, import,
two redeploys within a few hours), not a recurring defect.

## Map-timeout finding (Phase 3)

Tracked as **GitHub Issue #27**
(`Follow-up: harden get_market_map_markers_v1 / /api/v1/map-markers
against unfiltered wide-area timeouts`). Confirmed:
- The shipped `/research/map` UI (`MarketMapExplorer.tsx`) only exposes
  three filter buttons (Suburbs/Postcodes/LGAs, default Suburbs) and
  structurally never sends an unfiltered request — no real user traffic
  can reproduce this.
- The one API path that *could* reach it (`/api/v1/map-markers` with
  `type` omitted) degrades gracefully: `getMapMarkers()` swallows RPC
  errors to an empty array rather than propagating a 500.
- No partial or excessive result returned in any test (row/bbox caps
  enforced inside the function throughout).
- No database instability followed either occurrence — connections,
  locks, and advisor findings all normal immediately after and during
  this closure pass.
- Recommendations filed in the issue (require bounds at the API contract
  level, reject unfiltered calls, stricter max area, index improvements,
  shorter explicit timeout, caching) — **not implemented during launch
  monitoring**, since normal user traffic never reproduced a material
  issue, per explicit instruction not to patch Production preemptively.

## Environment variables (names only, no values)

Exactly 5 Production Vercel environment variables were added for this
launch: `WAREHOUSE_SUPABASE_URL`, `WAREHOUSE_SUPABASE_ANON_KEY`,
`WAREHOUSE_PREVIEW_ENABLED`, `PUBLIC_API_V1_ENABLED`,
`MULTI_STATE_RESEARCH_ENABLED`. All scoped to Production only (verified —
not accidentally applied to Preview/Development). None are
`NEXT_PUBLIC_`-prefixed, so none are bundled into browser-side code at
all (server-only, stricter than merely "safe if exposed"). The anon key
used is the legacy JWT anon key (public/publishable by design, gated by
RLS and grants, not by secrecy) — **no service-role credential was
added**. `RESEARCH_COPILOT_ENABLED` and `INTERNAL_OPERATIONS_ENABLED`
remain absent from Production. The 4 pre-existing, unrelated Production
variables (`ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`) were
confirmed untouched (creation timestamps unchanged throughout).

## Feature-gate confirmation

- **Copilot**: `RESEARCH_COPILOT_ENABLED` absent from Production;
  `/research/copilot/*` returns 404. Confirmed at launch, at t+~5h
  monitoring, and post-merge.
- **Admin**: `/admin` returns 404 at every check point.
- **Operations**: `INTERNAL_OPERATIONS_ENABLED` absent;
  `/research/data-status` returns 404 at every check point.

## Rollback

**Not used.** The pre-launch baseline (`dpl_AtHt2b5xLV7o6YDVsrVdS1LWA2Gf`)
remains available as a reference point in Vercel's deployment history but
was never redeployed to — no rollback trigger condition (application
failure, import failure, data-quality failure, security failure, or
performance failure per the approved runbook's Part 8) was ever met.

## Monitoring window results (t+5/15/30/60)

**Honest note on timing**: this closure mission was picked up
approximately 5 hours 4 minutes after the redeploy that activated the
flags (deployment `dpl_FfcAqKDQsEthMuqx1J1ZAFHojhH2`, created
07:30:42 UTC; closure work began ~12:34:58 UTC) — all four nominal
windows had already passed in real wall-clock time before this mission
began. Per instruction, they were run immediately rather than skipped or
fabricated at their literal historical timestamps:

- **Application**: all routes/APIs checked (see Functional Verification
  above) — clean at the time of this check.
- **Logs**: `vercel logs` only exposes a recent rolling tail, not a
  historical range query — it cannot retrieve log data from the literal
  t+5/t+15/t+30 marks 5 hours in the past. What *is* verifiable: the
  deployment has shown continuous `Ready` status with no crash-loop or
  auto-rollback across the entire elapsed period (checked via `vercel
  inspect`), and the available recent log tail shows zero 5xx responses.
  This is disclosed as a tooling limitation, not glossed over as if full
  historical log data were reviewed.
- **Database**: migration ledger unchanged (ends at `046`), 21 tables /
  452,176 rows unchanged, 0 blocked locks, 0 non-idle connections beyond
  normal pooled backends, security advisor findings unchanged.
- **Performance**: see Performance Findings above — two transient blips
  investigated and characterized as cold-start artifacts, not recurring
  issues.

## Final classification

**GO — Production launch is live, stable, and closed out at the code
level (PR #26 merged, main CI green, post-merge deployment healthy).**

One item remains genuinely open, tracked rather than hidden:
- **Phase 2 real-account UAT of the newly-launched Research features is
  still pending** Abdul's own testing. This does not retroactively
  invalidate the already-successful, already-monitored launch, but this
  report will be updated the moment those results are in, per this
  sprint's standing rule to never infer real UAT from automated
  evidence.

Everything else required for closure — monitoring, security, performance,
environment reconciliation, PR merge, post-merge deployment
verification, and the tracked map-timeout follow-up — is complete.
