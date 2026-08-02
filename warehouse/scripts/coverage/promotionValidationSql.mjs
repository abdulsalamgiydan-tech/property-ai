/**
 * PostgreSQL validation statements for a FUTURE, real, lineage-qualified yield
 * promotion payload. Single source of truth: the promotion package doc AND
 * promotion_sql.test.ts (which executes these against real PostgreSQL via
 * PGlite) both use this module, so "PostgreSQL-valid" is proven, not asserted.
 *
 * Note: in PostgreSQL, `date - date` returns an INTEGER number of days, so the
 * period-compatibility check compares to an integer (400), NOT an interval.
 */

/** Minimal ephemeral schema the statements validate against. */
export const PROMOTION_SCHEMA_DDL = `
create schema if not exists core;
create schema if not exists mart;

create table if not exists core.market_observation (
  observation_id  text primary key,
  geography_id    text not null,
  geography_level text not null,
  property_type   text not null,
  bedroom_group   text,
  sample_size     integer,
  status          text not null,
  period_start    date not null,
  period_end      date not null
);

create table if not exists mart.suburb_yield_recovered (
  geography_id          text not null,
  gross_yield_pct       numeric not null,
  property_type         text not null,
  bedroom_group         text,
  price_observation_id  text not null,
  rent_observation_id   text not null,
  price_period          date not null,
  rent_period           date not null,
  formula_version       text not null,
  status                text not null
);
`;

/** Each returns a single integer column `violations`; a qualified payload yields 0 for every check. */
export const PROMOTION_VALIDATIONS = [
  {
    name: "orphan_observation_refs",
    description: "every mart row cites two real upstream observations",
    sql: `select count(*)::int as violations
          from mart.suburb_yield_recovered y
          where not exists (select 1 from core.market_observation o where o.observation_id = y.price_observation_id)
             or not exists (select 1 from core.market_observation o where o.observation_id = y.rent_observation_id)`,
  },
  {
    name: "aggregate_property_type",
    description: "no aggregate 'all' yields (registry: house/unit only)",
    sql: `select count(*)::int as violations
          from mart.suburb_yield_recovered
          where property_type not in ('house','unit')`,
  },
  {
    name: "incompatible_periods",
    description: "price/rent period ends within 400 days (date - date = integer days)",
    sql: `select count(*)::int as violations
          from mart.suburb_yield_recovered
          where abs(price_period - rent_period) > 400`,
  },
  {
    name: "non_direct_suburb_inputs",
    description: "both inputs are independently suburb-level and direct",
    sql: `select count(*)::int as violations
          from mart.suburb_yield_recovered y
          join core.market_observation p on p.observation_id = y.price_observation_id
          join core.market_observation r on r.observation_id = y.rent_observation_id
          where p.geography_level <> 'suburb' or r.geography_level <> 'suburb'
             or p.status <> 'direct' or r.status <> 'direct'`,
  },
];
