# Sprint 9 — Existing State Audit (Phase 0)

Generated: 2026-07-21 (full detail: `sprint9_existing_state_audit.json`)

## Targets

- Production: `oshquaxsloolqucwvigc` — **0 warehouse schemas**, only pre-existing `public.*` app tables (all RLS-enabled). Confirmed distinct from the branch.
- Branch: `warehouse-validation` (`lzonauinzatmtytyoems`) — **2,052 MB**, 10 migrations applied (003-011 plus a base `remote_schema`).
- Git: `feature/deal-analyser-budget-2026`, working tree clean, HEAD = Sprint 8's RBA commit.

## Key finding: two placeholder mart tables already exist

`mart.suburb_market_snapshot` and `mart.postcode_market_snapshot` were created back in
migration 003 (Sprint 1) as **forward-looking placeholders** — 0 rows, never populated,
and (confirmed via repo-wide grep) never referenced by any app code. Their existing grain
is *tall* (one row per geography × month × dwelling_type); Sprint 9's spec wants a *wide*
row per geography with dwelling-type medians as separate columns. No unique constraint
exists on them yet.

**Decision:** migration 013 extends these tables **additively** (`ALTER TABLE ADD COLUMN
IF NOT EXISTS` for every new Sprint 9 field, plus a new unique index for the wide-row
grain) rather than creating duplicate, differently-named tables. This avoids DROP/replace
entirely and finally puts Sprint 1's placeholders to use as originally intended.

## RLS / access

All 35 warehouse tables have RLS disabled (flagged by Supabase's own advisor) — but
nothing in the app currently points at the branch project, so this is not reachable today.
Phase 9 will add a minimal, tested `public.*` view/RPC layer on the branch rather than
retrofitting RLS policies across all 35 existing tables (out of scope for this sprint,
noted as a follow-up in the read-only access design doc).

## App architecture

- Next.js 16.2.3 App Router. Existing Supabase client wiring (`lib/supabase/client.ts`,
  `lib/supabase/server.ts`, `middleware.ts`) points **only** at the production project via
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **The new `/research` feature will use a separate, server-only warehouse Supabase
  client** (new env vars, never wired into the existing production client) so the branch
  is only ever reachable in local/preview environments, gated behind
  `WAREHOUSE_PREVIEW_ENABLED`.
- An existing, unrelated `/suburb-intelligence` route + `SuburbIntelligenceClient`
  component already ships in the app (static deal-analyser suburb assumptions, unrelated
  to the warehouse) — **not touched**. The new feature lives at `/research` instead.
- Reusable design system: `components/design/{tokens,MetricCard,StatusBadge,SectionCard,
  EmptyState,DisclaimerFooter,CTAButton}.tsx` and `components/design/shell/*` — all reused
  for the new interface rather than inventing new visual patterns.
- Test setup: Vitest, node environment, colocated `*.test.ts` files.

## NSW sales dwelling classification gap (feeds Phase 3)

The entire current `detached_house` bucket (2.56M rows) is assigned from
`(nature_of_property='RESIDENCE', zone_code='R', strata_lot IS NULL)` with no further
split. Of these, **18,712 rows** (0.73%) carry a non-null `unit_number` or a `/` in
`house_number` while still being non-strata — the standard NSW torrens-title signal for a
subdivided villa/townhouse/duplex development that was never strata-plan'd (sample-checked:
"14 East Cres" has 6 distinct `unit_number` values sharing one street address — clearly a
multi-dwelling development, not one house). This is genuine, deterministic, non-price/
suburb/postcode evidence and becomes the new `townhouse_villa_semidetached` rule in
Phase 3. A distinct `duplex` bucket was considered and rejected — PSI data has no field
that separates duplexes from other torrens multi-dwelling forms without inferring from
price or lot count, which the sprint's rules forbid.

## Risks carried into later phases

1. Extend, don't replace, the Sprint 1 placeholder mart tables.
2. Build a minimal read-only view/RPC layer rather than a full RLS retrofit.
3. New, separate warehouse Supabase client — never reuse the production one.
4. New route `/research` — never touch `/suburb-intelligence`.
5. Re-verify production stays at 0 warehouse schemas after every branch load in this sprint.
