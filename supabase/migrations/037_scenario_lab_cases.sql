-- ============================================================
-- Sprint 13 Phase 1, Workstream 6 — Scenario Lab v2 saved cases.
-- Additive only: new table, no DROP/TRUNCATE/DELETE, same RLS shape as
-- every existing public.* user table (see 001_propellect_schema.sql).
--
-- A "scenario case" is a geography-level affordability/cashflow scenario
-- (deposit/rate/term/vacancy/expenses against a suburb's recorded median
-- sale price and rent) — a different subject to property_reports (a
-- specific user-entered property deal), so it gets its own table rather
-- than being force-fit into that shape.
-- ============================================================

create table if not exists public.scenario_lab_cases (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  geography_id            text not null,
  geography_code          text not null,
  geography_label         text not null,
  label                   text,
  deposit_percent         numeric not null,
  loan_term_years         numeric not null,
  interest_rate_percent   numeric not null,
  vacancy_percent         numeric,
  annual_expenses         numeric,
  scenario_json           jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.scenario_lab_cases enable row level security;

drop policy if exists "Users can view their own scenario cases" on public.scenario_lab_cases;
create policy "Users can view their own scenario cases"
  on public.scenario_lab_cases for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own scenario cases" on public.scenario_lab_cases;
create policy "Users can insert their own scenario cases"
  on public.scenario_lab_cases for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own scenario cases" on public.scenario_lab_cases;
create policy "Users can update their own scenario cases"
  on public.scenario_lab_cases for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own scenario cases" on public.scenario_lab_cases;
create policy "Users can delete their own scenario cases"
  on public.scenario_lab_cases for delete
  using (auth.uid() = user_id);

drop trigger if exists set_scenario_lab_cases_updated_at on public.scenario_lab_cases;
create trigger set_scenario_lab_cases_updated_at
  before update on public.scenario_lab_cases
  for each row execute function public.set_updated_at();

create index if not exists scenario_lab_cases_user_idx
  on public.scenario_lab_cases (user_id, created_at desc);
