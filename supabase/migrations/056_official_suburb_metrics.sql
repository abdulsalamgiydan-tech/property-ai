-- 056 — additive official-source suburb metrics (SA + VIC CC-BY lanes).
--
-- STATUS: PREPARED, NOT APPLIED REMOTELY. Rehearsed locally only (blank +
-- current-schema PostgreSQL via PGlite). Do not apply to Supabase validation or
-- Production without separate human approval. Migration 055 is unchanged.
--
-- ADDITIVE ONLY: creates two NEW internal tables (core/mart) + ONE read-only
-- public view. No existing object is altered or dropped; no existing grants are
-- widened; no RLS is weakened. `anon`/`authenticated` get SELECT only on the
-- consumer view (never on core/mart/raw/staging). No property-level PII is
-- stored — only aggregate suburb medians/counts.

create schema if not exists core;
create schema if not exists mart;

-- Full-lineage accepted observation (internal — no anon/authenticated grant).
create table if not exists core.official_observation (
  observation_id   text primary key,              -- deterministic, content-addressed
  source_id        text not null,
  resource_sha256  text not null,                 -- exact raw-byte identity
  geography_id     text not null,                 -- canonical SAL
  geography_level  text not null default 'suburb',
  asgs_version     text not null,
  metric           text not null,
  property_type    text not null,
  bedroom_group    text not null,
  value            numeric not null,
  unit             text not null,
  sample_size      integer,
  period_start     date,
  period_end       date not null,
  status           text not null default 'direct', -- direct | derived | contextual
  quality_status   text not null default 'passed',
  formula_version  text,
  price_observation_id text,                        -- derived lineage (e.g. yield inputs)
  rent_observation_id  text,
  licence          text not null,
  attribution      text not null,
  retrieved_at     timestamptz not null,
  constraint official_observation_value_positive check (value > 0),
  constraint official_observation_status_ck check (status in ('direct','derived','contextual')),
  constraint official_observation_type_ck check (property_type in ('house','unit','land','all'))
);

-- Consumer mart projection (internal table; exposed only via the view below).
create table if not exists mart.official_suburb_metric (
  geography_id   text not null,
  metric         text not null,
  property_type  text not null,
  bedroom_group  text not null,
  value          numeric not null,
  unit           text not null,
  sample_size    integer,
  period_end     date not null,
  status         text not null,
  source_id      text not null,
  attribution    text not null,
  primary key (geography_id, metric, property_type, bedroom_group, period_end)
);

-- Read-only, consumer-safe public projection (no internal ids / raw checksums).
create or replace view public.v_official_suburb_metric_v1 as
  select geography_id, metric, property_type, bedroom_group, value, unit,
         sample_size, period_end, status, source_id, attribution
  from mart.official_suburb_metric
  where status = 'direct';
comment on view public.v_official_suburb_metric_v1 is
  'Read-only public projection of accepted official suburb metrics (SA/VIC CC-BY). Direct suburb observations only; aggregate medians/counts, no property-level PII, no internal lineage ids or raw checksums.';

-- Least-privilege: revoke everything, grant SELECT on the view only.
revoke all privileges on table public.v_official_suburb_metric_v1 from anon, authenticated;
grant select on table public.v_official_suburb_metric_v1 to anon, authenticated;
