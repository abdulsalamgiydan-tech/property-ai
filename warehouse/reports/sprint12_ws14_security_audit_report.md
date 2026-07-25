# Sprint 12, Workstream 14 — Security, RLS, and Access Model

## Scope: re-audit, not re-decide

Sprint 11 WS17 already made and documented the correct architectural
decision (`warehouse/docs/WAREHOUSE_SECURITY_DECISION.md`): RLS stays
disabled on `core`/`mart`/`meta`/`staging`; the real security boundary is
schema-level PostgREST invisibility (zero grants to `anon`/`authenticated`),
not row policies, because this data has no per-row ownership concept.
WS14's job is to verify that decision still holds after everything added
across Sprint 12 (WS4/WS6/WS8/WS9/WS10 added ~15 new tables; WS5/WS8/WS9/
WS11 added 3 new views + 1 new function; WS11-WS13 added an entirely new
application-layer `/api/v1/*` surface that didn't exist when WS17 audited).

## Live-verified: the schema-invisibility boundary holds

```sql
select count(*) from information_schema.role_table_grants
where grantee in ('anon','authenticated') and table_schema in ('core','mart','meta','staging');
-- 0
```

**53 internal tables** across `core`/`mart`/`meta`/`staging` (up from 44 at
WS17's last audit), **zero** grants to `anon`/`authenticated` on any of
them — every table added this sprint (the WS9 quality-monitoring tables,
the WS8 lineage registry, the WS4 boundary-bridge tables, etc.) correctly
inherited the schema's existing invisibility; nothing needed a per-table
decision, because the boundary is set at the schema level.

## Live-verified: every new public view/function matches the audited pattern

**11 public views** (8 pre-existing + `v_metric_lineage_v1`,
`v_quality_summary_v1`, `v_evidence_catalogue_v1`), **10 public functions**
(9 pre-existing + `get_metric_lineage_v1`). Checked every one added this
sprint:

- All `SECURITY DEFINER` with an explicit, fixed `search_path`
  (`get_metric_lineage_v1`: `search_path=public, mart, meta`) — a
  `SECURITY DEFINER` function WITHOUT a fixed search_path is vulnerable to
  search-path-injection privilege escalation; every function in this
  project, old and new, sets one correctly.
- `get_metric_lineage_v1` uses parameterized PL/pgSQL variable comparisons
  (`where m.geography_id = p_geography_id`), never dynamic SQL string
  construction — no injection surface.
- New views (`v_metric_lineage_v1`, `v_quality_summary_v1`,
  `v_evidence_catalogue_v1`) deliberately expose only aggregate/safe
  columns — never `meta.data_incident.evidence`,
  `meta.data_quarantine_summary.sample_row_ids`, internal load-run ids, or
  raw investigation notes (verified by re-reading each view definition
  against what it selects).

Supabase advisor (`get_advisors`) flags the new objects with the exact
same lint categories (`security_definer_view`,
`anon_security_definer_function_executable`) as every pre-existing
view/function — consistent with an already-reviewed, deliberate
architecture, not a new risk category introduced this sprint.

## Real gap found and fixed: no CORS headers on `/api/v1/*`

`PUBLIC_API_V1_CONTRACT.md` documents this API as possibly serving
external callers, but no `Access-Control-Allow-Origin` header existed —
a browser-based cross-origin caller would have been silently blocked by
the browser's own CORS enforcement (a curl/server-to-server caller is
unaffected either way, since CORS is purely a browser-side restriction —
this gap would only have surfaced when someone actually tried to build a
browser-based integration against this API). Fixed: every `/api/v1/*`
response (including the CSV export's raw `NextResponse`, which
constructs its headers separately from the JSON envelope helper) now
carries `Access-Control-Allow-Origin: *`. A permissive origin is the
correct choice here specifically: the API is read-only, unauthenticated,
carries no cookies/credentials, and serves the same anon-key-gated public
data a browser could already read directly via the Supabase REST API with
the same key — restricting the origin would add no real security, only
break the documented external-caller use case. Live-verified via curl
with an explicit `Origin` header on both a JSON and the CSV export route.

## Not addressed (documented as a known gap, not silently ignored)

- **Rate limiting** — still absent, already flagged in
  `PUBLIC_API_V1_CONTRACT.md` (WS11). Confirmed the gap is still real
  after WS14's audit; not fixed here (no current abuse signal, this
  project's standing rule against speculative infrastructure).
- **`public.waitlist`'s permissive INSERT RLS policy** (`WITH CHECK (true)`
  for `anon`) — a pre-existing, unrelated PRODUCTION application-table
  finding surfaced by the advisor scan, not part of this Sprint 12
  warehouse mission's scope (it's the marketing waitlist form, not
  research data). Noted here for visibility, not touched — a human
  decision, not a warehouse/API architecture question.

## Validation

- Live SQL re-verification of grants, view/function definitions, and
  `search_path` settings (not read from documentation — queried fresh).
- `npm test`: 163/163 pass (2 new — CORS header presence on both success
  and error responses).
- `npm run build`/`lint`: pass.
- Live-verified CORS headers on a running dev server via curl with an
  explicit cross-origin `Origin` header, on both the JSON envelope and
  the CSV export route.
- Production (`oshquaxsloolqucwvigc`): re-confirmed no schema changes
  (this workstream only touched the branch and the application layer).

## Files

- `lib/warehouse/apiV1.ts` — `CORS_HEADERS`, applied to
  `apiV1Ok`/`apiV1Error`
- `lib/warehouse/apiV1.test.ts` — 2 new tests
- `app/api/v1/export/[geographyId]/route.ts` — CORS headers on the raw
  CSV response
- `warehouse/docs/PUBLIC_API_V1_CONTRACT.md` — new CORS section

## Exact next workstream

WS15 — performance and storage hardening.
