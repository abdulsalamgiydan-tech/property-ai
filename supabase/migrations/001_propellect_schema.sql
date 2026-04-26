-- ============================================================
-- Propellect — Database Schema Migration
-- Run this in your Supabase SQL editor or via Supabase CLI.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- ── 0. waitlist ──────────────────────────────────────────────
-- Required by the early-access auth flow (notifyEarlyAccessInterest).
create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists "Anyone can join the waitlist" on public.waitlist;
create policy "Anyone can join the waitlist"
  on public.waitlist for insert
  with check (true);

drop policy if exists "Service role can read waitlist" on public.waitlist;
create policy "Service role can read waitlist"
  on public.waitlist for select
  using (auth.role() = 'service_role');

-- ── 1. property_reports ─────────────────────────────────────
create table if not exists public.property_reports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  property_name    text,
  address          text,
  suburb           text,
  state            text,
  property_type    text,
  purchase_price   numeric,
  weekly_rent      numeric,
  score            numeric,
  status_colour    text,
  inputs_json      jsonb,
  results_json     jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.property_reports enable row level security;

drop policy if exists "Users can view their own reports" on public.property_reports;
create policy "Users can view their own reports"
  on public.property_reports for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own reports" on public.property_reports;
create policy "Users can insert their own reports"
  on public.property_reports for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own reports" on public.property_reports;
create policy "Users can update their own reports"
  on public.property_reports for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own reports" on public.property_reports;
create policy "Users can delete their own reports"
  on public.property_reports for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at
drop function if exists public.set_updated_at() cascade;
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_property_reports_updated_at on public.property_reports;
create trigger set_property_reports_updated_at
  before update on public.property_reports
  for each row execute function public.set_updated_at();

-- ── 2. property_comparisons ──────────────────────────────────
create table if not exists public.property_comparisons (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  report_a_id      uuid references public.property_reports(id) on delete set null,
  report_b_id      uuid references public.property_reports(id) on delete set null,
  label            text,
  comparison_json  jsonb,
  created_at       timestamptz not null default now()
);

alter table public.property_comparisons enable row level security;

drop policy if exists "Users can view their own comparisons" on public.property_comparisons;
create policy "Users can view their own comparisons"
  on public.property_comparisons for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own comparisons" on public.property_comparisons;
create policy "Users can insert their own comparisons"
  on public.property_comparisons for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own comparisons" on public.property_comparisons;
create policy "Users can update their own comparisons"
  on public.property_comparisons for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own comparisons" on public.property_comparisons;
create policy "Users can delete their own comparisons"
  on public.property_comparisons for delete
  using (auth.uid() = user_id);

-- ── 3. watchlist_items ───────────────────────────────────────
create table if not exists public.watchlist_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  type               text not null default 'property',
  property_report_id uuid references public.property_reports(id) on delete set null,
  suburb             text,
  state              text,
  notes              text,
  created_at         timestamptz not null default now()
);

alter table public.watchlist_items enable row level security;

drop policy if exists "Users can view their own watchlist" on public.watchlist_items;
create policy "Users can view their own watchlist"
  on public.watchlist_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own watchlist items" on public.watchlist_items;
create policy "Users can insert their own watchlist items"
  on public.watchlist_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own watchlist items" on public.watchlist_items;
create policy "Users can update their own watchlist items"
  on public.watchlist_items for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own watchlist items" on public.watchlist_items;
create policy "Users can delete their own watchlist items"
  on public.watchlist_items for delete
  using (auth.uid() = user_id);

-- ── 4. portfolio_properties ──────────────────────────────────
create table if not exists public.portfolio_properties (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  property_report_id   uuid references public.property_reports(id) on delete set null,
  label                text,
  current_value        numeric,
  loan_balance         numeric,
  weekly_rent          numeric,
  annual_expenses      numeric,
  ownership_percentage numeric default 100,
  created_at           timestamptz not null default now()
);

alter table public.portfolio_properties enable row level security;

drop policy if exists "Users can view their own portfolio" on public.portfolio_properties;
create policy "Users can view their own portfolio"
  on public.portfolio_properties for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert into their own portfolio" on public.portfolio_properties;
create policy "Users can insert into their own portfolio"
  on public.portfolio_properties for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own portfolio" on public.portfolio_properties;
create policy "Users can update their own portfolio"
  on public.portfolio_properties for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete from their own portfolio" on public.portfolio_properties;
create policy "Users can delete from their own portfolio"
  on public.portfolio_properties for delete
  using (auth.uid() = user_id);
