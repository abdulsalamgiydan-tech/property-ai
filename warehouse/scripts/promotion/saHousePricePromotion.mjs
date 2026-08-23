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
 *   - scoped cleanup / rollback / before-after SQL (by source_id + resource_sha256);
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

/** Non-Production branch-ref guard. Never returns or logs the URL itself. */
export function validateBranchRef(dbUrl, { prodRef, branchRef } = {}) {
  if (!dbUrl) return { ok: false, reason: "missing_db_url" };
  if (prodRef && dbUrl.includes(prodRef)) return { ok: false, reason: "production_ref_detected" };
  if (!branchRef) return { ok: false, reason: "missing_branch_ref" };
  if (!dbUrl.includes(branchRef)) return { ok: false, reason: "url_does_not_reference_branch_ref" };
  return { ok: true };
}

/** All execution preconditions in one place. Returns {ok, errors[]}; never throws. */
export function assertExecutionPreconditions(o) {
  const errors = [];
  if (!o.execute) errors.push("missing_execute_flag");
  const b = validateBranchRef(o.dbUrl, { prodRef: o.prodRef, branchRef: o.branchRef });
  if (!b.ok) errors.push(b.reason);
  if (o.expectedSha && o.sourceSha !== o.expectedSha) errors.push("checksum_drift");
  if (o.expectedFingerprint && o.schemaFingerprint !== o.expectedFingerprint) errors.push("schema_fingerprint_drift");
  if (Number(o.rowCount) > Number(o.rowCap)) errors.push(`row_cap_exceeded:${o.rowCount}>${o.rowCap}`);
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

/** Cleanup / before-after SQL, scoped ONLY by source_id + resource_sha256. */
export function buildScopedSql() {
  return {
    beforeCore: "select count(*)::int c from core.official_observation where source_id = $1 and resource_sha256 = $2",
    beforeMart: "select count(*)::int c from mart.official_suburb_metric where source_id = $1",
    cleanupMart:
      "delete from mart.official_suburb_metric where source_id = $1 and (geography_id, metric, property_type, bedroom_group, period_end) in (" +
      "select geography_id, metric, property_type, bedroom_group, period_end from core.official_observation where source_id = $1 and resource_sha256 = $2)",
    cleanupCore: "delete from core.official_observation where source_id = $1 and resource_sha256 = $2",
  };
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
