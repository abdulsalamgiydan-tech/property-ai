-- Sprint 14 WS21 — user_feedback table.
--
-- Backs a simple in-app feedback form (lib/supabase/feedback.ts,
-- components/feedback/FeedbackWidget.tsx). Append-only, same shape as
-- strategy_generations/research_copilot_queries: a user can see and
-- add their own feedback, but never edit or delete a submission once
-- sent (feedback is meant to be an honest, unaltered record).
--
-- Additive only: creates one new table, no changes to any existing
-- table, policy, or function. Not a destructive migration.
--
-- NOTE: this migration is written and statically verified (see
-- 044_user_feedback.test.ts and warehouse:rls:check) but is
-- NOT applied to production as part of Sprint 14 Workstream 21 —
-- same explicit-approval guardrail as migrations 041/042/043. The feedback
-- widget only renders for a signed-in user and its submit call fails
-- gracefully (a friendly error message, not a crash) if this table
-- doesn't exist yet.

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  message text not null,
  page_path text,
  created_at timestamptz not null default now()
);

create index if not exists user_feedback_user_created_idx
  on public.user_feedback (user_id, created_at desc);

alter table public.user_feedback enable row level security;

-- auth.uid() is wrapped in (select ...) per Supabase's own performance
-- advisor guidance (Sprint 15 baseline audit) — this lets Postgres
-- evaluate it once per statement (an InitPlan) instead of once per row.
-- No behavioural change from the unwrapped form, purely a performance fix.
drop policy if exists "Users can view their own feedback" on public.user_feedback;
create policy "Users can view their own feedback"
  on public.user_feedback for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own feedback" on public.user_feedback;
create policy "Users can insert their own feedback"
  on public.user_feedback for insert
  with check ((select auth.uid()) = user_id);
