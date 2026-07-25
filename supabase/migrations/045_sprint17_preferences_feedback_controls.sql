-- Sprint 17 -- richer onboarding preferences and feedback controls.
--
-- Additive only. Extends existing Sprint 15 user-owned tables without
-- changing ownership, weakening RLS, or introducing service-role access.

alter table public.user_onboarding_preferences
  add column if not exists strategy_focus text,
  add column if not exists investment_timeframe text,
  add column if not exists budget_range text,
  add column if not exists deposit_range text,
  add column if not exists preferred_property_types text[] not null default '{}',
  add column if not exists risk_tolerance text,
  add column if not exists buyer_context text,
  add column if not exists portfolio_status text,
  add column if not exists guidance_level text,
  add column if not exists notification_frequency text,
  add column if not exists completion_step integer not null default 1,
  add column if not exists skipped_at timestamptz,
  add column if not exists last_edited_from text;

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_strategy_focus_check,
  add constraint user_onboarding_preferences_strategy_focus_check
    check (strategy_focus is null or strategy_focus in ('balanced', 'capital_growth', 'cash_flow'));

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_timeframe_check,
  add constraint user_onboarding_preferences_timeframe_check
    check (investment_timeframe is null or investment_timeframe in ('0_2_years', '3_5_years', '6_10_years', '10_plus_years'));

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_budget_check,
  add constraint user_onboarding_preferences_budget_check
    check (budget_range is null or budget_range in ('under_500k', '500k_750k', '750k_1m', '1m_1_5m', '1_5m_plus', 'not_sure'));

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_deposit_check,
  add constraint user_onboarding_preferences_deposit_check
    check (deposit_range is null or deposit_range in ('under_100k', '100k_200k', '200k_350k', '350k_plus', 'not_sure'));

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_risk_check,
  add constraint user_onboarding_preferences_risk_check
    check (risk_tolerance is null or risk_tolerance in ('conservative', 'balanced', 'higher_growth'));

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_buyer_context_check,
  add constraint user_onboarding_preferences_buyer_context_check
    check (buyer_context is null or buyer_context in ('first_home_buyer', 'investor', 'owner_occupier', 'researching'));

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_portfolio_status_check,
  add constraint user_onboarding_preferences_portfolio_status_check
    check (portfolio_status is null or portfolio_status in ('none', 'one_property', 'two_to_four', 'five_plus'));

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_guidance_check,
  add constraint user_onboarding_preferences_guidance_check
    check (guidance_level is null or guidance_level in ('light', 'guided', 'detailed'));

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_notification_frequency_check,
  add constraint user_onboarding_preferences_notification_frequency_check
    check (notification_frequency is null or notification_frequency in ('none', 'weekly', 'monthly'));

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_completion_step_check,
  add constraint user_onboarding_preferences_completion_step_check
    check (completion_step between 1 and 4);

alter table public.user_feedback
  add column if not exists satisfaction_score integer,
  add column if not exists contact_permission boolean not null default false,
  add column if not exists client_submission_id text,
  add column if not exists technical_context jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'new',
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_feedback
  drop constraint if exists user_feedback_category_check,
  add constraint user_feedback_category_check
    check (category in ('bug', 'feature_request', 'idea', 'general', 'other'));

alter table public.user_feedback
  drop constraint if exists user_feedback_satisfaction_score_check,
  add constraint user_feedback_satisfaction_score_check
    check (satisfaction_score is null or satisfaction_score between 1 and 5);

alter table public.user_feedback
  drop constraint if exists user_feedback_message_length_check,
  add constraint user_feedback_message_length_check
    check (char_length(message) between 1 and 1000);

alter table public.user_feedback
  drop constraint if exists user_feedback_status_check,
  add constraint user_feedback_status_check
    check (status in ('new', 'reviewed', 'closed'));

create unique index if not exists user_feedback_user_submission_id_idx
  on public.user_feedback (user_id, client_submission_id)
  where client_submission_id is not null;

create index if not exists user_feedback_status_created_idx
  on public.user_feedback (status, created_at desc);
