/**
 * Sprint 12, Workstream 9 — the quality rule ENGINE.
 *
 * One generic executor per rule FAMILY, each parameterized by a registered
 * meta.data_quality_rule row's target_schema/target_table/expected_threshold.
 * This is deliberately NOT a collection of per-dataset scripts — registering
 * a new rule for a new dataset means inserting one row into
 * meta.data_quality_rule, not writing a new script.
 *
 * Every executor returns { passed, actualResult, affectedRowCount, evidence }.
 * `evidence` is a small sample of the actual offending rows (never the full
 * set — keeps meta.data_quality_result rows small) used for both the
 * database record and human-readable reports.
 */

const EVIDENCE_LIMIT = 5;

function qualIdent(name) {
  // Defends against SQL injection via rule catalogue rows (target_schema/
  // target_table/column names come from meta.data_quality_rule, which is
  // written only by this project's own scripts -- but every value is still
  // validated here rather than trusted, since a rule row is still
  // "external" input from the engine's point of view.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`unsafe identifier rejected: ${JSON.stringify(name)}`);
  return name;
}

// A key_columns entry for duplicate_natural_key may be a plain identifier
// OR the specific coalesce(<ident>,'<short literal>') form (needed for
// grain columns that can be NULL, e.g. dwelling_type on the wide snapshot
// marts). Deliberately narrow -- not a general expression evaluator.
function qualKeyColumn(expr) {
  const coalesceMatch = /^coalesce\(([a-zA-Z_][a-zA-Z0-9_]*),\s*'([a-zA-Z0-9_ ]{0,32})'\)$/.exec(expr);
  if (coalesceMatch) return `coalesce(${qualIdent(coalesceMatch[1])},'${coalesceMatch[2]}')`;
  return qualIdent(expr);
}

async function runDuplicateNaturalKey(client, rule) {
  const table = `${qualIdent(rule.target_schema)}.${qualIdent(rule.target_table)}`;
  const keyCols = (rule.expected_threshold?.key_columns ?? []).map(qualKeyColumn);
  if (keyCols.length === 0) throw new Error(`rule ${rule.rule_id}: expected_threshold.key_columns required`);
  const { rows } = await client.query(
    `select ${keyCols.join(",")}, count(*)::int as n from ${table} group by ${keyCols.join(",")} having count(*) > 1 order by n desc limit ${EVIDENCE_LIMIT + 1}`
  );
  return {
    passed: rows.length === 0,
    actualResult: { duplicate_key_count: rows.length },
    affectedRowCount: rows.reduce((s, r) => s + r.n, 0),
    evidence: rows.slice(0, EVIDENCE_LIMIT),
  };
}

async function runNullRequiredField(client, rule) {
  const table = `${qualIdent(rule.target_schema)}.${qualIdent(rule.target_table)}`;
  const col = qualIdent(rule.expected_threshold?.column);
  const filter = rule.expected_threshold?.filter_sql ?? "true";
  const { rows: countRows } = await client.query(`select count(*)::int as n from ${table} where ${col} is null and (${filter})`);
  const n = countRows[0].n;
  const { rows: evidence } = n > 0 ? await client.query(`select * from ${table} where ${col} is null and (${filter}) limit ${EVIDENCE_LIMIT}`) : { rows: [] };
  return { passed: n === 0, actualResult: { null_count: n }, affectedRowCount: n, evidence };
}

async function runOrphanGeography(client, rule) {
  const table = `${qualIdent(rule.target_schema)}.${qualIdent(rule.target_table)}`;
  const col = qualIdent(rule.expected_threshold?.geography_id_column ?? "geography_id");
  const { rows: countRows } = await client.query(
    `select count(*)::int as n from ${table} t where t.${col} is not null and not exists (select 1 from core.dim_geography g where g.geography_id = t.${col})`
  );
  const n = countRows[0].n;
  const { rows: evidence } = n > 0
    ? await client.query(`select t.${col} from ${table} t where t.${col} is not null and not exists (select 1 from core.dim_geography g where g.geography_id = t.${col}) limit ${EVIDENCE_LIMIT}`)
    : { rows: [] };
  return { passed: n === 0, actualResult: { orphan_count: n }, affectedRowCount: n, evidence };
}

async function runNegativeValue(client, rule) {
  const table = `${qualIdent(rule.target_schema)}.${qualIdent(rule.target_table)}`;
  const col = qualIdent(rule.expected_threshold?.column);
  const { rows: countRows } = await client.query(`select count(*)::int as n from ${table} where ${col} < 0`);
  const n = countRows[0].n;
  const { rows: evidence } = n > 0 ? await client.query(`select * from ${table} where ${col} < 0 limit ${EVIDENCE_LIMIT}`) : { rows: [] };
  return { passed: n === 0, actualResult: { negative_count: n }, affectedRowCount: n, evidence };
}

async function runRangeCheck(client, rule) {
  const table = `${qualIdent(rule.target_schema)}.${qualIdent(rule.target_table)}`;
  const col = qualIdent(rule.expected_threshold?.column);
  const { min, max } = rule.expected_threshold ?? {};
  const conditions = [];
  const params = [];
  if (min !== undefined) { params.push(min); conditions.push(`${col} < $${params.length}`); }
  if (max !== undefined) { params.push(max); conditions.push(`${col} > $${params.length}`); }
  if (conditions.length === 0) throw new Error(`rule ${rule.rule_id}: expected_threshold.min or .max required`);
  const where = `${col} is not null and (${conditions.join(" or ")})`;
  const { rows: countRows } = await client.query(`select count(*)::int as n from ${table} where ${where}`, params);
  const n = countRows[0].n;
  const { rows: evidence } = n > 0 ? await client.query(`select * from ${table} where ${where} limit ${EVIDENCE_LIMIT}`, params) : { rows: [] };
  return { passed: n === 0, actualResult: { out_of_range_count: n, min, max }, affectedRowCount: n, evidence };
}

async function runMissingConfidenceLabel(client, rule) {
  const table = `${qualIdent(rule.target_schema)}.${qualIdent(rule.target_table)}`;
  const valueCol = qualIdent(rule.expected_threshold?.value_column);
  const confCol = qualIdent(rule.expected_threshold?.confidence_column);
  const { rows: countRows } = await client.query(`select count(*)::int as n from ${table} where ${valueCol} is not null and ${confCol} is null`);
  const n = countRows[0].n;
  const { rows: evidence } = n > 0 ? await client.query(`select * from ${table} where ${valueCol} is not null and ${confCol} is null limit ${EVIDENCE_LIMIT}`) : { rows: [] };
  return { passed: n === 0, actualResult: { missing_confidence_count: n }, affectedRowCount: n, evidence };
}

async function runFutureDatedObservation(client, rule) {
  const table = `${qualIdent(rule.target_schema)}.${qualIdent(rule.target_table)}`;
  const col = qualIdent(rule.expected_threshold?.period_column);
  // Rows already marked quarantined (data_quality_status) by a prior fix
  // (e.g. quarantine_future_dated_sales.mjs) must not keep re-triggering
  // this rule forever -- quarantine is a resolution, not a no-op. Only
  // applied when the target table actually has this column.
  const quarantineCol = rule.expected_threshold?.exclude_quarantined_column;
  const where = quarantineCol
    ? `${col} > current_date and (${qualIdent(quarantineCol)} is distinct from 'quarantined')`
    : `${col} > current_date`;
  const { rows: countRows } = await client.query(`select count(*)::int as n from ${table} where ${where}`);
  const n = countRows[0].n;
  const { rows: evidence } = n > 0 ? await client.query(`select * from ${table} where ${where} limit ${EVIDENCE_LIMIT}`) : { rows: [] };
  return { passed: n === 0, actualResult: { future_dated_count: n }, affectedRowCount: n, evidence };
}

async function runInvalidGeometry(client, rule) {
  const table = `${qualIdent(rule.target_schema)}.${qualIdent(rule.target_table)}`;
  const col = qualIdent(rule.expected_threshold?.geom_column ?? "geom");
  const { rows: countRows } = await client.query(`select count(*)::int as n from ${table} where ${col} is not null and not st_isvalid(${col})`);
  const n = countRows[0].n;
  const { rows: evidence } = n > 0
    ? await client.query(`select geography_id, st_isvalidreason(${col}) as reason from ${table} where ${col} is not null and not st_isvalid(${col}) limit ${EVIDENCE_LIMIT}`)
    : { rows: [] };
  return { passed: n === 0, actualResult: { invalid_geometry_count: n }, affectedRowCount: n, evidence };
}

async function runWeightReconciliation(client, rule) {
  const tolerancePct = rule.expected_threshold?.tolerance_pct ?? 1.0;
  // For each source geography, the weighted correspondence ratios to all of
  // its targets (within one correspondence_version) should sum close to 1.0.
  const { rows } = await client.query(`
    select source_geography_id, correspondence_version, sum(preferred_weight) as total_weight
    from core.bridge_geography_correspondence
    where preferred_weight is not null
    group by 1, 2
    having abs(sum(preferred_weight) - 1.0) > $1 / 100.0
    limit ${EVIDENCE_LIMIT + 1}
  `, [tolerancePct]);
  return {
    passed: rows.length === 0,
    actualResult: { out_of_tolerance_source_geographies: rows.length, tolerance_pct: tolerancePct },
    affectedRowCount: rows.length,
    evidence: rows.slice(0, EVIDENCE_LIMIT),
  };
}

async function runRowCountAnomaly(client, rule) {
  const table = `${qualIdent(rule.target_schema)}.${qualIdent(rule.target_table)}`;
  const filter = rule.expected_threshold?.filter_sql ?? "true";
  const maxPctChange = rule.expected_threshold?.max_pct_change ?? 30;
  const { rows: countRows } = await client.query(`select count(*)::int as n from ${table} where ${filter}`);
  const currentCount = countRows[0].n;
  // Compare against the most recent PASSED result's recorded row count for
  // this exact rule -- the baseline is this rule's own history, not a
  // hardcoded expectation (a table that legitimately grows over time
  // shouldn't need its threshold hand-tuned every sprint).
  const { rows: baselineRows } = await client.query(
    `select actual_result->>'row_count' as row_count from meta.data_quality_result
     where rule_id = $1 and status = 'passed' order by created_at desc limit 1`,
    [rule.rule_id]
  );
  const baseline = baselineRows[0] ? Number(baselineRows[0].row_count) : null;
  let passed = true;
  let pctChange = null;
  if (baseline !== null && baseline > 0) {
    pctChange = ((currentCount - baseline) / baseline) * 100;
    passed = Math.abs(pctChange) <= maxPctChange;
  } else if (baseline === null && currentCount === 0) {
    // No history yet AND the table is empty -- an empty replacement dataset
    // on a genuinely first-ever run is still worth flagging, not silently passed.
    passed = false;
  }
  return {
    passed,
    actualResult: { row_count: currentCount, baseline, pct_change: pctChange, max_pct_change: maxPctChange },
    affectedRowCount: passed ? 0 : currentCount,
    evidence: [],
  };
}

async function runStaleSource(client) {
  const { rows } = await client.query(
    `select dataset_id, jurisdiction, freshness_status, latest_source_period, expected_cadence_days
     from meta.dataset_freshness_status where freshness_status in ('stale','critical')`
  );
  return {
    passed: rows.length === 0,
    actualResult: { stale_dataset_count: rows.length },
    affectedRowCount: rows.length,
    evidence: rows.slice(0, EVIDENCE_LIMIT),
  };
}

async function runBrokenSourceUrl(client, rule, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const { rows: sources } = await client.query(
    `select source_id, source_url from meta.source where source_url is not null and implementation_status != 'discontinued'`
  );
  const failures = [];
  for (const s of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetchImpl(s.source_url, { method: "GET", signal: controller.signal, redirect: "follow" });
      clearTimeout(timer);
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        failures.push({ source_id: s.source_id, reason: `HTTP ${res.status}` });
      } else if (rule.expected_threshold?.reject_html_for && rule.expected_threshold.reject_html_for.includes(s.source_id) && contentType.includes("text/html")) {
        failures.push({ source_id: s.source_id, reason: `expected a data file, got HTML (content-type: ${contentType})` });
      }
    } catch (err) {
      failures.push({ source_id: s.source_id, reason: `request failed: ${String(err.message ?? err).slice(0, 200)}` });
    }
  }
  return {
    passed: failures.length === 0,
    actualResult: { sources_checked: sources.length, failures: failures.length },
    affectedRowCount: failures.length,
    evidence: failures.slice(0, EVIDENCE_LIMIT),
  };
}

async function runMissingLineage(client) {
  // Delegates to the exact same completeness logic as
  // warehouse/scripts/lineage/validate_metric_lineage_completeness.mjs
  // (Sprint 12 WS8) rather than re-implementing it -- this rule exists so
  // "missing lineage" shows up in the quality-run/report surface, not as a
  // second source of truth.
  const { validateLineageCompleteness } = await import("../lineage/validate_metric_lineage_completeness_lib.mjs");
  const result = await validateLineageCompleteness(client);
  return {
    passed: result.mandatoryGapCount === 0,
    actualResult: { total_checked: result.total, covered: result.covered, completeness_pct: result.completenessPct },
    affectedRowCount: result.mandatoryGapCount,
    evidence: result.gaps.filter((g) => g.mandatory).slice(0, EVIDENCE_LIMIT),
  };
}

async function runCrossBorderGeographyJoin(client) {
  // The exact anomaly WS8 found: postcode_market_snapshot rows whose
  // heuristic-derived jurisdiction doesn't match the state implied by their
  // sales_source in metric_provenance (currently only nsw_vg_sales is a
  // known cross-border case -- registered in meta.metric_lineage_registry
  // with transformation_method='cross_border_postcode_attribution_unresolved').
  const { postcodeToState } = await import("../lib/postcode_to_state.mjs");
  const { rows } = await client.query(`
    select m.geography_id, m.geography_code, m.sales_volume_12m, m.metric_provenance->>'sales_source' as sales_source
    from mart.postcode_market_snapshot m
    where m.dwelling_type is null and m.sales_volume_12m is not null and m.metric_provenance->>'sales_source' is not null
  `);
  const anomalies = [];
  const stateToJurisdiction = { "1": "NSW", "2": "VIC", "3": "QLD", "4": "SA", "5": "WA", "6": "TAS", "7": "NT", "8": "ACT" };
  // The known source->jurisdiction each sales_source is EXPECTED to belong to.
  const SOURCE_JURISDICTION = { nsw_vg_sales: "NSW", vic_vg_sales: "VIC" };
  for (const r of rows) {
    const heuristicState = postcodeToState(r.geography_code);
    const heuristicJurisdiction = heuristicState ? stateToJurisdiction[heuristicState] : null;
    const expectedJurisdiction = SOURCE_JURISDICTION[r.sales_source];
    if (expectedJurisdiction && heuristicJurisdiction && expectedJurisdiction !== heuristicJurisdiction) {
      anomalies.push({ geography_code: r.geography_code, sales_source: r.sales_source, expected_jurisdiction: expectedJurisdiction, heuristic_jurisdiction: heuristicJurisdiction, sales_volume_12m: r.sales_volume_12m });
    }
  }
  // This rule is ADVISORY, not blocking: WS8 already investigated and
  // registered these as a known, documented, unresolved case (real NSW
  // sales data, tiny volumes) -- not a defect to block promotion over,
  // but one that must stay visible until root-caused.
  return {
    passed: anomalies.length === 0,
    actualResult: { anomaly_count: anomalies.length },
    affectedRowCount: anomalies.length,
    evidence: anomalies.slice(0, EVIDENCE_LIMIT),
  };
}

async function runSchemaDrift(client, rule) {
  const expectedColumns = rule.expected_threshold?.expected_columns ?? [];
  const { rows } = await client.query(
    `select column_name from information_schema.columns where table_schema = $1 and table_name = $2`,
    [rule.target_schema, rule.target_table]
  );
  const actualColumns = new Set(rows.map((r) => r.column_name));
  const missing = expectedColumns.filter((c) => !actualColumns.has(c));
  return {
    passed: missing.length === 0,
    actualResult: { expected_count: expectedColumns.length, actual_count: actualColumns.size, missing },
    affectedRowCount: missing.length,
    evidence: missing.map((c) => ({ missing_column: c })),
  };
}

async function runChecksumChange(client) {
  // Advisory/informational: flags datasets whose most recent source_file
  // hash differs from the one before it -- a real, useful signal for the
  // refresh engine (WS10), not a failure on its own.
  const { rows } = await client.query(`
    with ranked as (
      select source_id, file_hash, downloaded_at,
        lag(file_hash) over (partition by source_id order by downloaded_at) as prev_hash
      from meta.source_file where file_hash is not null
    )
    select source_id, file_hash, prev_hash, downloaded_at from ranked
    where prev_hash is not null and file_hash <> prev_hash
    order by downloaded_at desc limit ${EVIDENCE_LIMIT + 1}
  `);
  return {
    passed: true, // informational only -- a changed checksum is expected, healthy refresh behaviour
    actualResult: { changed_count: rows.length },
    affectedRowCount: 0,
    evidence: rows.slice(0, EVIDENCE_LIMIT),
  };
}

export const RULE_EXECUTORS = {
  duplicate_natural_key: runDuplicateNaturalKey,
  null_required_field: runNullRequiredField,
  orphan_geography: runOrphanGeography,
  negative_value: runNegativeValue,
  range_check: runRangeCheck,
  missing_confidence_label: runMissingConfidenceLabel,
  future_dated_observation: runFutureDatedObservation,
  invalid_geometry: runInvalidGeometry,
  weight_reconciliation: runWeightReconciliation,
  row_count_anomaly: runRowCountAnomaly,
  stale_source: runStaleSource,
  broken_source_url: runBrokenSourceUrl,
  missing_lineage: runMissingLineage,
  cross_border_geography_join: runCrossBorderGeographyJoin,
  schema_drift: runSchemaDrift,
  checksum_change: runChecksumChange,
};

export async function executeRule(client, rule, opts) {
  const executor = RULE_EXECUTORS[rule.rule_family];
  if (!executor) throw new Error(`no executor registered for rule_family '${rule.rule_family}' (rule ${rule.rule_id})`);
  return executor(client, rule, opts);
}
