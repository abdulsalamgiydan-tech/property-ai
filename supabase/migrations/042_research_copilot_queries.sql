-- Sprint 14 WS5 — research_copilot_queries table.
--
-- Backs rate limiting and an audit trail for the grounded AI research
-- copilot (lib/research/copilotRateLimit.ts). Mirrors the existing
-- strategy_generations table's shape (002_strategy.sql) — same
-- ownership model, same RLS pattern (select/insert own rows only, no
-- update/delete surface since a query record should be immutable once
-- logged).
--
-- Additive only: creates one new table, no changes to any existing
-- table, policy, or function. Not a destructive migration.
--
-- NOTE: this migration is written and statically verified (see
-- 042_research_copilot_queries.test.ts and warehouse:rls:check) but is
-- NOT applied to production as part of Sprint 14 Workstream 5 — the
-- research copilot feature is gated off by default
-- (RESEARCH_COPILOT_ENABLED, unset in production), so nothing calls
-- this table until both the flag and this migration are explicitly
-- turned on with user approval, per this project's standing production
-- database change guardrail.

create table if not exists public.research_copilot_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  geography_id uuid not null,
  question text not null,
  grounded boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists research_copilot_queries_user_created_idx
  on public.research_copilot_queries (user_id, created_at desc);

alter table public.research_copilot_queries enable row level security;

drop policy if exists "Users can view their own copilot queries" on public.research_copilot_queries;
create policy "Users can view their own copilot queries"
  on public.research_copilot_queries for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own copilot queries" on public.research_copilot_queries;
create policy "Users can insert their own copilot queries"
  on public.research_copilot_queries for insert
  with check (auth.uid() = user_id);
