/**
 * PURE promotion logic for the SA metropolitan house-price batch (Official
 * Coverage Uplift 1.1). No database client, no network, no filesystem side
 * effects at import — safe to unit-test without any connection. The guarded CLI
 * (validate_sa_house_price_branch.mjs) imports `pg` DYNAMICALLY only on --execute.
 *
 * Responsibilities:
 *   - transform candidate canonical observations -> core.official_observation rows
 *     (candidate metric -> target metric/property/status; SAL code -> canonical id);
 *   - environment guards (branch-only, Production-ref refusal);
 *   - row-cap + checksum + schema-fingerprint enforcement;
 *   - exact pre-existing-row classification and rollback residue snapshots;
 *   - output sanitisation (never leak connection strings, tokens, emails).
 */
import crypto from "node:crypto";

export const SA_HOUSE_PRICE_BATCH = {
  sourceId: "sa_metro_median_house_sales",
  resourceSha256: "9cfa8aa71d2c453c09ca1d3baecc1955144863cfb5c4caef01c12266e639ef7a",
  schemaFingerprint: "6297926bf4b8f7e97eb0cc7d9cbc88830b5659d3cb535135d21280e1305d547b",
  asgsVersion: "ASGS3_2021",
  geographyLevel: "suburb",
  licence: "CC BY 4.0",
  attribution: "© Government of South Australia (CC BY 4.0)",
  reportingPeriodEnd: "2026-06-30",
  retrievedAt: "2026-08-23T05:21:59.978Z",
  rowCap: 340,
  prodRef: "oshquaxsloolqucwvigc",
  migrations: [
    "supabase/migrations/056_official_suburb_metrics.sql",
    "supabase/migrations/057_official_suburb_metrics_consumer_rpc.sql",
    "supabase/migrations/058_signed_price_growth_constraint.sql",
  ],
};

// Candidate (offline) metric -> warehouse official-metrics target.
export const METRIC_MAP = {
  median_sale_price_detached: { metric: "median_house_price", unit: "AUD", status: "direct", formula: null },
  annual_price_growth_12m: { metric: "price_growth_12m", unit: "%", status: "derived", formula: "publisher_median_change@1" },
};

/** SAL code (e.g. "40085") -> canonical warehouse geography id. */
export function toWarehouseGeographyId(code) {
  const c = String(code ?? "").trim();
  if (!/^\d{4,6}$/.test(c)) throw new Error(`invalid_sal_code:${code}`);
  return `SAL_${c}_ASGS3_2021`;
}

/** Deterministic, content-addressed observation id. */
export function observationId(parts) {
  return "obs_" + crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 40);
}

/** Candidate canonical observation -> official_observation payload row (throws on an unmapped metric). */
export function candidateToOfficialRow(obs, ctx = SA_HOUSE_PRICE_BATCH) {
  const map = METRIC_MAP[obs.metric];
  if (!map) throw new Error(`unmapped_candidate_metric:${obs.metric}`);
  const geo = toWarehouseGeographyId(obs.geographyId);
  const pe = obs.reportingPeriod;
  const bg = "all";
  return {
    id: observationId([ctx.sourceId, geo, map.metric, obs.propertyType, bg, pe, ctx.resourceSha256]),
    src: ctx.sourceId,
    sha: ctx.resourceSha256,
    geo,
    metric: map.metric,
    pt: obs.propertyType,
    bg,
    val: obs.value,
    unit: map.unit,
    n: obs.sampleSize ?? null,
    ps: obs.periodStart ?? null,
    pe,
    status: map.status,
    formula: map.formula,
    licence: ctx.licence,
    attr: ctx.attribution,
    retrieved_at: ctx.retrievedAt,
  };
}

export function candidateBatchToRows(observations, ctx = SA_HOUSE_PRICE_BATCH) {
  return observations.map((o) => candidateToOfficialRow(o, ctx));
}

/** Ordered params for officialPromotion.INSERT_OBSERVATION (22 columns, real retrieved_at). */
export function officialObservationValues(r) {
  return [
    r.id, r.src, r.sha, r.geo, "suburb", "ASGS3_2021", r.metric, r.pt, r.bg, r.val, r.unit,
    r.n ?? null, r.ps ?? null, r.pe, r.status, "passed", r.formula ?? null, null, null,
    r.licence, r.attr, r.retrieved_at,
  ];
}

function urlReferencesRef(parsed, ref) {
  if (!ref) return false;
  const target = String(ref).toLowerCase();
  const hostParts = parsed.hostname.toLowerCase().split(".");
  const userParts = decodeURIComponent(parsed.username || "").toLowerCase().split(".");
  return hostParts.includes(target) || userParts.includes(target);
}

/**
 * Non-Production branch-ref guard. A ref must be an exact hostname/username
 * segment (db.<ref>.supabase.co or postgres.<ref>@...pooler.supabase.com); loose
 * substring matches are deliberately rejected. The URL is never returned/logged.
 */
export function validateBranchRef(dbUrl, { prodRef, branchRef } = {}) {
  if (!dbUrl) return { ok: false, reason: "missing_db_url" };
  if (!branchRef) return { ok: false, reason: "missing_branch_ref" };
  let parsed;
  try { parsed = new URL(dbUrl); } catch { return { ok: false, reason: "invalid_db_url" }; }
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) return { ok: false, reason: "invalid_db_url_protocol" };
  if (prodRef && urlReferencesRef(parsed, prodRef)) return { ok: false, reason: "production_ref_detected" };
  if (!urlReferencesRef(parsed, branchRef)) return { ok: false, reason: "url_does_not_reference_branch_ref" };
  return { ok: true };
}

/** All execution preconditions in one place. Returns {ok, errors[]}; never throws. */
export function assertExecutionPreconditions(o) {
  const errors = [];
  if (!o.execute) errors.push("missing_execute_flag");
  if (!o.rollbackValidation) errors.push("missing_rollback_validation_flag");
  const b = validateBranchRef(o.dbUrl, { prodRef: o.prodRef, branchRef: o.branchRef });
  if (!b.ok) errors.push(b.reason);
  if (o.expectedSha && o.sourceSha !== o.expectedSha) errors.push("checksum_drift");
  if (o.expectedFingerprint && o.schemaFingerprint !== o.expectedFingerprint) errors.push("schema_fingerprint_drift");
  if (Number(o.rowCount) > Number(o.rowCap)) errors.push(`row_cap_exceeded:${o.rowCount}>${o.rowCap}`);
  if (o.expectedRowCount != null && Number(o.rowCount) !== Number(o.expectedRowCount)) {
    errors.push(`unexpected_row_count:${o.rowCount}!=${o.expectedRowCount}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Expected mart rows = unique (geo,metric,pt,bg,pe) among direct/derived rows. */
export function expectedMartRowCount(rows) {
  const keys = new Set(
    rows.filter((r) => r.status === "direct" || r.status === "derived")
      .map((r) => `${r.geo}|${r.metric}|${r.pt}|${r.bg}|${r.pe}`),
  );
  return keys.size;
}

// Atomic rollback validation never exposes a cleanup/delete mode. A broad
// source+checksum delete could remove rows that predated the run; rollback plus
// exact before/after snapshots is the only accepted restoration mechanism.

// ── Atomic remote-validation primitives (pure; no DB/network) ───────────────

export const REQUIRED_MIGRATIONS = ["056", "057", "058"];

/** Which required migration versions are absent from the applied ledger. */
export function missingMigrations(appliedVersions, required = REQUIRED_MIGRATIONS) {
  const applied = (appliedVersions ?? []).map((v) => String(v));
  return required.filter((requiredVersion) => !applied.some(
    (appliedVersion) => appliedVersion === requiredVersion || appliedVersion.startsWith(`${requiredVersion}_`),
  ));
}

export const MIGRATION_LEDGER = {
  presentSql: "select (to_regclass('supabase_migrations.schema_migrations') is not null) present",
  versionsSql: "select version from supabase_migrations.schema_migrations order by version",
};

/** Physical objects/invariant that must already exist; this harness applies no DDL. */
export const STRUCTURAL_CHECKS = [
  { name: "core_official_observation", sql: "select (to_regclass('core.official_observation') is not null) present" },
  { name: "mart_official_suburb_metric", sql: "select (to_regclass('mart.official_suburb_metric') is not null) present" },
  { name: "public_direct_view", sql: "select (to_regclass('public.v_official_suburb_metric_v1') is not null) present" },
  {
    name: "consumer_rpc",
    sql: "select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_official_suburb_metrics_v1') present",
  },
  {
    name: "signed_growth_constraint",
    sql: "select exists(select 1 from pg_constraint where conname='official_observation_value_bounds' and conrelid='core.official_observation'::regclass) present",
  },
];

/** Canonical DB-field projection used for exact-content conflict checks. */
export function candidateCoreFields(r) {
  return {
    source_id: r.src,
    resource_sha256: r.sha,
    geography_id: r.geo,
    geography_level: "suburb",
    asgs_version: "ASGS3_2021",
    metric: r.metric,
    property_type: r.pt,
    bedroom_group: r.bg,
    value: r.val,
    unit: r.unit,
    sample_size: r.n ?? null,
    period_start: r.ps ?? null,
    period_end: r.pe,
    status: r.status,
    quality_status: "passed",
    formula_version: r.formula ?? null,
    price_observation_id: r.price ?? null,
    rent_observation_id: r.rent ?? null,
    licence: r.licence,
    attribution: r.attr,
    retrieved_at: r.retrieved_at,
  };
}

export const CORE_COMPARE_FIELDS = Object.keys(candidateCoreFields({}));
export const CORE_SELECT_SQL = `
  select ${CORE_COMPARE_FIELDS.join(", ")}
  from core.official_observation where observation_id=$1`;

export function normaliseComparableField(field, value) {
  if (value == null || value === "") return null;
  if (field === "value" || field === "sample_size") return Number(value);
  if (field === "period_start" || field === "period_end") {
    return String(value instanceof Date ? value.toISOString() : value).slice(0, 10);
  }
  if (field === "retrieved_at") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  return String(value);
}

export function classifyExistingCore(candidateRow, existingDbRow) {
  if (!existingDbRow) return { kind: "new" };
  const candidate = candidateCoreFields(candidateRow);
  for (const field of CORE_COMPARE_FIELDS) {
    if (normaliseComparableField(field, candidate[field]) !== normaliseComparableField(field, existingDbRow[field])) {
      return { kind: "conflict", field, observation_id: candidateRow.id };
    }
  }
  return { kind: "exact" };
}

export const MART_COMPARE_FIELDS = ["value", "unit", "sample_size", "status", "source_id", "attribution"];

export function candidateMartKey(r) {
  return `${r.geo}|${r.metric}|${r.pt}|${r.bg}|${r.pe}`;
}

export function candidateMartFields(r) {
  return {
    value: r.val,
    unit: r.unit,
    sample_size: r.n ?? null,
    status: r.status,
    source_id: r.src,
    attribution: r.attr,
  };
}

export const MART_SELECT_SQL = `
  select ${MART_COMPARE_FIELDS.join(", ")}
  from mart.official_suburb_metric
  where geography_id=$1 and metric=$2 and property_type=$3
    and bedroom_group=$4 and period_end=$5::date`;

export function classifyExistingMart(candidateRow, existingMartRow) {
  if (!existingMartRow) return { kind: "new" };
  const candidate = candidateMartFields(candidateRow);
  for (const field of MART_COMPARE_FIELDS) {
    if (normaliseComparableField(field, candidate[field]) !== normaliseComparableField(field, existingMartRow[field])) {
      return { kind: "conflict", field, natural_key: candidateMartKey(candidateRow) };
    }
  }
  return { kind: "exact" };
}

export function computeExpectedDeltas(coreClasses, martClasses) {
  const count = (values, kind) => values.filter((value) => value.kind === kind).length;
  const conflicts = [
    ...coreClasses.filter((value) => value.kind === "conflict"),
    ...martClasses.filter((value) => value.kind === "conflict"),
  ];
  return {
    candidate_core_rows: coreClasses.length,
    candidate_mart_keys: martClasses.length,
    core_new: count(coreClasses, "new"),
    core_exact_existing: count(coreClasses, "exact"),
    mart_new: count(martClasses, "new"),
    mart_exact_existing: count(martClasses, "exact"),
    expected_core_delta: count(coreClasses, "new"),
    expected_mart_delta: count(martClasses, "new"),
    conflicts,
    has_conflict: conflicts.length > 0,
  };
}

/** Candidate-ID-scoped validations; unrelated pre-existing rows cannot affect them. */
export function buildCandidateValidations(candidateIds) {
  const params = [candidateIds];
  const scope = "observation_id = any($1::text[])";
  return [
    { name: "non_growth_positive", sql: `select count(*)::int violations from core.official_observation where ${scope} and metric<>'price_growth_12m' and value<=0`, params },
    { name: "growth_in_bounds", sql: `select count(*)::int violations from core.official_observation where ${scope} and metric='price_growth_12m' and (value < -100 or value > 1000)`, params },
    { name: "price_direct", sql: `select count(*)::int violations from core.official_observation where ${scope} and metric='median_house_price' and status<>'direct'`, params },
    { name: "growth_derived", sql: `select count(*)::int violations from core.official_observation where ${scope} and metric='price_growth_12m' and (status<>'derived' or formula_version is null)`, params },
    { name: "candidate_shape", sql: `select count(*)::int violations from core.official_observation where ${scope} and (geography_level<>'suburb' or asgs_version<>'ASGS3_2021' or property_type<>'house' or bedroom_group<>'all')`, params },
    { name: "provenance_complete", sql: `select count(*)::int violations from core.official_observation where ${scope} and (retrieved_at is null or licence is null or attribution is null or resource_sha256 is null)`, params },
  ];
}

const SECRET_RE = new RegExp(
  [
    "postgres(?:ql)?:\\/\\/[^\\s'\"]+", // connection strings
    "[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}", // emails
    "eyJ[A-Za-z0-9_-]{10,}", // JWT-ish
    "sbp_[A-Za-z0-9]{16,}", // supabase tokens
    "(?:password|pwd|secret|token|apikey|api_key)=\\S+", // key=value secrets
  ].join("|"),
  "gi",
);

/** Redact anything secret-shaped from a string before it is printed. */
export function sanitise(text) {
  return String(text).replace(SECRET_RE, "[redacted]");
}

/** A sanitised, sanitisation-checked plan summary — counts and identifiers only. */
export function sanitisedPlan(rows, ctx = SA_HOUSE_PRICE_BATCH) {
  const byMetric = {};
  const byStatus = {};
  for (const r of rows) {
    byMetric[r.metric] = (byMetric[r.metric] || 0) + 1;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }
  return {
    source_id: ctx.sourceId,
    resource_sha256: ctx.resourceSha256,
    schema_fingerprint: ctx.schemaFingerprint,
    reporting_period_end: ctx.reportingPeriodEnd,
    retrieved_at: ctx.retrievedAt,
    core_rows: rows.length,
    mart_rows: expectedMartRowCount(rows),
    row_cap: ctx.rowCap,
    within_cap: rows.length <= ctx.rowCap,
    by_metric: byMetric,
    by_status: byStatus,
    unique_geographies: new Set(rows.map((r) => r.geo)).size,
    target_table: "core.official_observation -> mart.official_suburb_metric",
    upsert_key_mart: "(geography_id, metric, property_type, bedroom_group, period_end)",
  };
}
