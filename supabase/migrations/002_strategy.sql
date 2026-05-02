-- Rate limiting table
create table if not exists public.strategy_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  sanitisation_flag boolean not null default false
);

create index if not exists strategy_generations_user_created_idx
  on public.strategy_generations (user_id, created_at desc);

alter table public.strategy_generations enable row level security;

drop policy if exists "Users can view their own generations" on public.strategy_generations;
create policy "Users can view their own generations"
  on public.strategy_generations for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own generations" on public.strategy_generations;
create policy "Users can insert their own generations"
  on public.strategy_generations for insert
  with check (auth.uid() = user_id);

-- Strategy reports table
create table if not exists public.strategy_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  archetype_id text not null,
  archetype_display_name text,
  input_json jsonb not null,
  output_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.strategy_reports enable row level security;

drop policy if exists "Users can view their own strategy reports" on public.strategy_reports;
create policy "Users can view their own strategy reports"
  on public.strategy_reports for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own strategy reports" on public.strategy_reports;
create policy "Users can insert their own strategy reports"
  on public.strategy_reports for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own strategy reports" on public.strategy_reports;
create policy "Users can update their own strategy reports"
  on public.strategy_reports for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own strategy reports" on public.strategy_reports;
create policy "Users can delete their own strategy reports"
  on public.strategy_reports for delete
  using (auth.uid() = user_id);
