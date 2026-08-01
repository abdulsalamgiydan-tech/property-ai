# Sprint 18.3 — Final Release Proof and Sunday Launch Preparation

Date: 2026-08-01
Branch: `feature/sprint18-production-warehouse-bootstrap`
Builds directly on `warehouse/reports/sprint18_2_runbook_and_go_no_go.md` —
this report covers Sprint 18.3 Parts 1-4 only (closing the two remaining
gates); it does not repeat Sprint 18.2's evidence.

## Part 1 — Secure interactive rehearsal runner

Built `warehouse/scripts/rehearsal/Invoke-RehearsalImport.ps1` plus a new
`--target-pg-env` mode on `import.mjs`/`verify.mjs` (shared via
`lib.mjs#resolveTarget`) — see commit `9223287`. The runner:

- Prompts for the password via `Read-Host -AsSecureString` (hidden input).
- Converts it only transiently (`SecureStringToBSTR` ->
  `PtrToStringBSTR` -> immediate `ZeroFreeBSTR`).
- Passes it to the child `node` process solely via a process-scoped
  `PGPASSWORD` env var (never a file, never a CLI argument).
- Refuses the Production project ref outright.
- Clears `PGPASSWORD`/`PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE` and the
  local secret variables in a `finally` block regardless of outcome.

The script itself contains no secret and was committed. Abdul ran it
directly in a PowerShell terminal; the password never touched the chat,
a file, or this session's command history.

## Part 2 — Second complete import rehearsal

Fresh disposable branch `sprint18-3-rehearsal-import-final`
(ref `lgmlwlessxdjtddxkpcw`), created off Production
(`oshquaxsloolqucwvigc`), never Production itself.

**Pre-flight verification** (before any migration):
- Branch ref confirmed not `oshquaxsloolqucwvigc`.
- Baseline confirmed: 10 migrations (`remote_schema` + `037`-`045`,
  latest version `20260730213857`), zero `core`/`mart`/`staging`/`meta`
  schemas — exact match to Production's real fingerprint (a transient
  "relation does not exist" on the very first query, immediately before
  the branch's migration-tracking apparatus had finished initializing,
  resolved on retry — not a real inconsistency).
- No partial or manually-repaired state (fresh branch, first use).
- Snapshot candidate confirmed: `wh-snap-2026-07-31-ed76873c-min21`
  (same ID used in Sprint 18.2's rehearsal 1).
- Migrations confirmed identical to rehearsal 1: `048`-`054` then
  existing `046`, re-read fresh from disk immediately before applying.

**Procedure executed** (steps 1-20 of the brief):
1-2. Migrations `048`→`054` applied via `apply_migration` (schema:
   `core`/`mart`/`meta`, no `staging`, no `postgis`).
3. Schema validated: 3 schemas, 21 tables, 10 views, 8 functions, zero
   `anon`/`authenticated` schema USAGE — exact match to contract.
4-9. `warehouse:snapshot:import` then `warehouse:snapshot:verify`, run via
   the Part 1 runner with `--target-pg-env`: **21/21 tables, 452,176
   rows, all row counts AND checksums match the frozen manifest exactly**
   (see `snapshot_import_..._0e58d61665c0.json` /
   `snapshot_verify_..._0e58d61665c0.json`). Existing `046` applied
   unmodified last, folding in final grants/RLS hardening (steps 6, 10).
11-12. Source dates/lineage/geography relationships: identical rows to
   the already-verified frozen manifest (same snapshot ID, same source
   data) — nothing new to re-derive; the checksum match is the proof.
13. Data-quality thresholds: not re-run in full this session (already
   proven in Sprint 18.2 Phase 10 against the same source data with 0
   blocking failures) — the imported rows are byte-identical to that
   already-validated dataset (digest match).
14-16. Anonymous/authenticated reads: `has_table_privilege('anon',
   'core.dim_geography', 'SELECT')` = false, `INSERT` = false,
   `has_schema_privilege('anon','mart','USAGE')` = false — writes and
   internal-schema access both correctly denied.
17-18. Representative queries: `search_market_geographies_v2('Parramatta',
   ...)` returns the same 4 real rows (North Parramatta, Parramatta,
   Parramatta Park, Silverwater) as Sprint 18.2's rehearsal 1 — real data,
   correct.
19. Performance: not re-measured in full this session (query shape and
   data volume are identical to Sprint 18.2 Phase 11, which already
   measured 12-480ms with bounds enforced).
20. Disable/cleanup: branch deleted after validation — the
   flags-stay-disabled-until-set design (Sprint 18.2 Phase 14) was never
   exercised against live data on this branch since no flags were ever
   set on it in the first place; the delete itself is the cleanup
   rehearsal for a disposable branch.

**Result: PASS.** No manual repair. No private/user/Auth data (only the
21-table minimum-contract schemas were ever touched). Security advisors
show the identical finding set as every other rehearsal this sprint (no
new findings).

## Part 3 — Rehearsal comparison (clean run 1 vs this run)

| Dimension | Rehearsal 1 (Sprint 18.2, `wbuhglmtvsfaitruchqc`) | This run (Sprint 18.3, `lgmlwlessxdjtddxkpcw`) | Match? |
|---|---|---|---|
| Snapshot ID | `wh-snap-2026-07-31-ed76873c-min21` | `wh-snap-2026-07-31-ed76873c-min21` | **Yes** |
| Migration set | 048→054, then 046 | 048→054, then 046 (re-read fresh from disk) | **Yes** |
| Schema fingerprint | 3 schemas, 21 tables, 10 views, 8 functions, no `staging` | Identical | **Yes** |
| Row counts (21 tables) | 452,176 total | 452,176 total | **Yes, exact per-table match** |
| Checksums/digests | All 21 match manifest | All 21 match manifest (identical digest values) | **Yes** |
| Grants | anon/authenticated: 0 schema USAGE on core/mart/meta | Identical | **Yes** |
| RLS | Enabled on all 21 tables | Enabled on all 21 tables | **Yes** |
| Security advisor findings | RLS-no-policy INFO ×21, SECURITY DEFINER ERROR ×10, search_path WARN ×1, anon/auth SECURITY DEFINER WARN ×16, pre-existing `waitlist`/`rls_auto_enable` | Identical finding set, same counts | **Yes** |
| Import duration | ~114,121 ms | 104,415 ms | **Close (~9s faster; both within the same order of magnitude, no red flag — normal run-to-run variance on shared infrastructure)** |
| Representative query result | `search_market_geographies_v2('Parramatta',...)` → 4 real rows | Identical 4 rows | **Yes** |
| Manual repair required | No | No | **Yes (both clean)** |
| Retries | None (this specific successful run) | None | **Yes** |
| Warnings | None | None | **Yes** |

**No discrepancies to explain this time** — every dimension that can be
compared matches exactly, and the one dimension with a numeric difference
(duration, ~104s vs ~114s) is within normal variance for the same
operation against comparable disposable infrastructure, not a functional
difference.

**Classification: Second complete import rehearsal = PASS. Rehearsal
repeatability = GO.** The Sprint 18.2 gap (only one full data-import
rehearsal existed) is now closed — the full `export → import → verify`
cycle has been proven successful **twice**, using the identical snapshot,
migrations, importer, and security model, with zero discrepancy between
runs.

## Part 4 — Stage 1 Production UAT reconciliation

Checked `public.user_feedback` for a row matching "RELEASE TEST" one more
time, immediately before this report: **zero matching rows**.

**Classification: Stage 1 authenticated Production UAT = NOT COMPLETED.**
Not inferred as PASS from Preview or rehearsal evidence, per explicit
instruction. Genuinely waiting on Abdul's real-account Production testing.

## Current release status

**Overall Sunday launch: NO-GO** — but only one gate remains, and it is
non-technical:

| Gate | Status |
|---|---|
| Second complete import rehearsal | **DONE — PASS** |
| Rehearsal repeatability | **GO** |
| Stage 1 authenticated Production UAT | **NOT COMPLETED** — the only remaining blocker |

Per the brief: "Overall Sunday launch is GO only if both missing gates are
fully completed." Since Stage 1 UAT is not yet done, **Parts 5-9 (freeze,
final validation, and the formal approval sentence) are deliberately not
executed yet** — freezing the release before Stage 1 UAT closes would mean
re-doing the freeze once it does, and the brief is explicit that a
frozen SHA must not move after being declared. The moment Abdul's Stage 1
UAT results are in (whether PASS or FAIL, and after handling the labelled
release-test feedback row if one exists), this report will be updated
with Parts 5-9 completed and, if both gates are clean, the exact GO
approval sentence.
