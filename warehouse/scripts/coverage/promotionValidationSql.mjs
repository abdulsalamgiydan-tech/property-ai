/**
 * PostgreSQL validation for a FUTURE, real, lineage-qualified yield promotion
 * payload. Single source of truth: the promotion package doc AND
 * promotion_sql.test.ts (which executes these against real PostgreSQL via
 * PGlite) both use this module.
 *
 * `contractViolationsSql($1 = as-of date)` enforces the COMPLETE canonical
 * contract — byte-for-byte the same predicates as lib/warehouse/yieldLineage.mjs
 * `qualifyYield` — and is proven equivalent by JS↔PGlite parity fixtures
 * (lineageParityFixtures.mjs). It returns the number of mart rows that fail ANY
 * predicate; a fully-qualified payload yields 0.
 *
 * Note: in PostgreSQL `date - date` returns an INTEGER number of days.
 */

/** Minimal ephemeral schema carrying every field the contract checks. */
export const PROMOTION_SCHEMA_DDL = `
create schema if not exists core;
create schema if not exists mart;

create table if not exists core.market_observation (
  observation_id               text primary key,
  observation_verified         boolean not null,
  geography_id                 text not null,
  asgs_version                 text not null,
  geography_level              text not null,
  direct_status                text,
  source_contract              text,
  provenance_verified          boolean not null,
  source_id                    text,
  quality_status               text,
  property_type                text,
  bedroom_group                text,
  aggregate_bedroom_legitimate boolean not null default false,
  sample_size                  integer,
  period_start                 date,
  period_end                   date,
  value                        numeric,
  quarantined                  boolean not null default false
);

create table if not exists mart.suburb_yield_recovered (
  geography_id          text not null,
  gross_yield_pct       numeric not null,
  property_type         text not null,
  bedroom_group         text,
  price_observation_id  text not null,
  rent_observation_id   text not null,
  formula_version       text not null,
  status                text not null
);
`;

const MIN_SAMPLE = 10;
const MAX_END_LAG_DAYS = 400;
const FRESHNESS_SLA_DAYS = 400;
const MAX_WINDOW_RATIO = 2;

/**
 * Full-contract violation count. `$1` is the as-of date (freshness anchor).
 * Every predicate mirrors qualifyYield's per-input + cross-input + period rules.
 */
export function contractViolationsSql() {
  return `
    select count(*)::int as violations
    from mart.suburb_yield_recovered y
    left join core.market_observation p on p.observation_id = y.price_observation_id
    left join core.market_observation r on r.observation_id = y.rent_observation_id
    where p.observation_id is null or r.observation_id is null
       -- 'is not true' makes NULL-valued predicates count as violations too
       -- (three-valued logic: a NULL field must NOT silently pass the contract).
       or (
            -- verified existence + provenance/source/quality, per input
            p.observation_verified and r.observation_verified
            and p.provenance_verified and r.provenance_verified
            and p.source_contract = 'accepted' and r.source_contract = 'accepted'
            and p.source_id is not null and r.source_id is not null
            and p.quality_status in ('passed','accepted') and r.quality_status in ('passed','accepted')
            and not p.quarantined and not r.quarantined
            -- geography identity + level + direct status
            and p.geography_id = r.geography_id and p.asgs_version = r.asgs_version
            and p.geography_level = 'suburb' and r.geography_level = 'suburb'
            and p.direct_status = 'direct' and r.direct_status = 'direct'
            -- property type: house/unit only, equal, and matching the mart row
            and p.property_type in ('house','unit') and r.property_type in ('house','unit')
            and p.property_type = r.property_type and y.property_type = p.property_type
            -- bedroom group: non-null, equal, 'all' only if a legitimate aggregate
            and p.bedroom_group is not null and r.bedroom_group is not null
            and p.bedroom_group = r.bedroom_group
            and (p.bedroom_group <> 'all' or (p.aggregate_bedroom_legitimate and r.aggregate_bedroom_legitimate))
            -- actual samples + positive values
            and p.sample_size >= ${MIN_SAMPLE} and r.sample_size >= ${MIN_SAMPLE}
            and p.value > 0 and r.value > 0
            -- freshness: not future, within SLA of the as-of date ($1)
            and p.period_end <= $1::date and r.period_end <= $1::date
            and ($1::date - p.period_end) <= ${FRESHNESS_SLA_DAYS}
            and ($1::date - r.period_end) <= ${FRESHNESS_SLA_DAYS}
            -- period windows: start<=end each; overlap OR bounded end-lag; ratio<=max
            and p.period_start <= p.period_end and r.period_start <= r.period_end
            and (
              least(p.period_end, r.period_end) - greatest(p.period_start, r.period_start) >= 0
              or abs(p.period_end - r.period_end) <= ${MAX_END_LAG_DAYS}
            )
            and (
              greatest((p.period_end - p.period_start), (r.period_end - r.period_start))::numeric
              / greatest(least((p.period_end - p.period_start), (r.period_end - r.period_start)), 1)
            ) <= ${MAX_WINDOW_RATIO}
       ) is not true`;
}

/** Individual named checks (subset), retained for targeted validation/debugging. */
export const PROMOTION_VALIDATIONS = [
  {
    name: "orphan_observation_refs",
    description: "every mart row cites two real upstream observations",
    sql: `select count(*)::int as violations from mart.suburb_yield_recovered y
          where not exists (select 1 from core.market_observation o where o.observation_id = y.price_observation_id)
             or not exists (select 1 from core.market_observation o where o.observation_id = y.rent_observation_id)`,
  },
  {
    name: "aggregate_property_type",
    description: "no aggregate 'all' yields (registry: house/unit only)",
    sql: `select count(*)::int as violations from mart.suburb_yield_recovered where property_type not in ('house','unit')`,
  },
  {
    name: "incompatible_periods",
    description: "price/rent period ends within 400 days (date - date = integer days)",
    sql: `select count(*)::int as violations
          from mart.suburb_yield_recovered y
          join core.market_observation p on p.observation_id = y.price_observation_id
          join core.market_observation r on r.observation_id = y.rent_observation_id
          where abs(p.period_end - r.period_end) > 400`,
  },
];
