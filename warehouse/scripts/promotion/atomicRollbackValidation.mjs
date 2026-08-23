/**
 * Rollback-only validation orchestrator for Official Coverage Uplift 1.2.
 *
 * The same database-agnostic function is driven by `pg` in the guarded CLI and
 * PGlite in integration tests. It has deliberately NO COMMIT path and applies NO
 * migrations: required migration-ledger entries and physical objects must already
 * exist. Every success and failure path rolls the transaction back.
 */
import {
  CORE_COMPARE_FIELDS, MART_COMPARE_FIELDS, MIGRATION_LEDGER, REQUIRED_MIGRATIONS, STRUCTURAL_CHECKS,
  buildCandidateValidations, candidateMartFields,
  candidateMartKey, classifyExistingCore, classifyExistingMart,
  computeExpectedDeltas, missingMigrations, normaliseComparableField,
  officialObservationValues,
} from "./saHousePricePromotion.mjs";
import { INSERT_MART, INSERT_OBSERVATION } from "./officialPromotion.mjs";

export class AtomicValidationError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "AtomicValidationError";
    this.code = code;
  }
}

const firstValue = (result) => Object.values(result.rows?.[0] ?? {})[0];
const asBoolean = (result) => firstValue(result) === true || firstValue(result) === "true" || firstValue(result) === 1;
const asCount = (result) => Number(firstValue(result) ?? 0);

function assertRows(rows, ctx) {
  if (!Array.isArray(rows) || rows.length === 0) throw new AtomicValidationError("candidate_rows_missing");
  if (rows.length > Number(ctx.rowCap)) throw new AtomicValidationError("row_cap_exceeded", `${rows.length}>${ctx.rowCap}`);
  if (rows.length !== Number(ctx.rowCap)) throw new AtomicValidationError("unexpected_row_count", `${rows.length}!=${ctx.rowCap}`);
  const ids = new Set(rows.map((row) => row.id));
  const martKeys = new Set(rows.map(candidateMartKey));
  if (ids.size !== rows.length) throw new AtomicValidationError("duplicate_observation_id");
  if (martKeys.size !== rows.length) throw new AtomicValidationError("duplicate_mart_natural_key");
  if (!rows.some((row) => row.status === "direct") || !rows.some((row) => row.status === "derived")) {
    throw new AtomicValidationError("direct_derived_split_missing");
  }
  for (const row of rows) {
    if (row.src !== ctx.sourceId || row.sha !== ctx.resourceSha256 || row.pe !== ctx.reportingPeriodEnd) {
      throw new AtomicValidationError("candidate_identity_mismatch", row.id);
    }
    if (!row.licence || !row.attr || !row.retrieved_at) throw new AtomicValidationError("candidate_provenance_missing", row.id);
  }
}

async function assertSchemaReady(db) {
  if (!asBoolean(await db.query(MIGRATION_LEDGER.presentSql))) {
    throw new AtomicValidationError("migration_ledger_missing");
  }
  const versions = (await db.query(MIGRATION_LEDGER.versionsSql)).rows.map((row) => row.version);
  const missing = missingMigrations(versions, REQUIRED_MIGRATIONS);
  if (missing.length) throw new AtomicValidationError("required_migrations_missing", missing.join(","));
  for (const check of STRUCTURAL_CHECKS) {
    if (!asBoolean(await db.query(check.sql))) throw new AtomicValidationError("required_structure_missing", check.name);
  }
  return { versions_checked: REQUIRED_MIGRATIONS.length, structures_checked: STRUCTURAL_CHECKS.length };
}

const CORE_BULK_SQL = `
  select observation_id, ${CORE_COMPARE_FIELDS.join(", ")}
  from core.official_observation where observation_id = any($1::text[])`;

const MART_BULK_SQL = `
  select geography_id, metric, property_type, bedroom_group, period_end,
         ${MART_COMPARE_FIELDS.join(", ")}
  from mart.official_suburb_metric
  where geography_id = any($1::text[])
    and metric = any($2::text[])
    and property_type = any($3::text[])
    and bedroom_group = any($4::text[])
    and period_end = any($5::date[])`;

async function readSnapshot(db, rows) {
  const coreResult = await db.query(CORE_BULK_SQL, [rows.map((row) => row.id)]);
  const core = new Map(coreResult.rows.map((row) => [row.observation_id, row]));
  const martResult = await db.query(MART_BULK_SQL, [
    [...new Set(rows.map((row) => row.geo))],
    [...new Set(rows.map((row) => row.metric))],
    [...new Set(rows.map((row) => row.pt))],
    [...new Set(rows.map((row) => row.bg))],
    [...new Set(rows.map((row) => row.pe))],
  ]);
  const mart = new Map(martResult.rows.map((row) => [candidateMartKey({
    geo: row.geography_id,
    metric: row.metric,
    pt: row.property_type,
    bg: row.bedroom_group,
    pe: normaliseComparableField("period_end", row.period_end),
  }), row]));
  return { core, mart };
}

function sameFields(left, right, fields) {
  if (!left || !right) return left == null && right == null;
  return fields.every((field) => (
    normaliseComparableField(field, left[field]) === normaliseComparableField(field, right[field])
  ));
}

function snapshotsEqual(before, after, rows) {
  return rows.every((row) => (
    sameFields(before.core.get(row.id), after.core.get(row.id), CORE_COMPARE_FIELDS)
    && sameFields(before.mart.get(candidateMartKey(row)), after.mart.get(candidateMartKey(row)), MART_COMPARE_FIELDS)
  ));
}

function assertSnapshotExact(snapshot, rows) {
  for (const row of rows) {
    const coreClass = classifyExistingCore(row, snapshot.core.get(row.id));
    if (coreClass.kind !== "exact") throw new AtomicValidationError("core_postload_mismatch", `${row.id}:${coreClass.field ?? coreClass.kind}`);
    const martClass = classifyExistingMart(row, snapshot.mart.get(candidateMartKey(row)));
    if (martClass.kind !== "exact") throw new AtomicValidationError("mart_postload_mismatch", `${candidateMartKey(row)}:${martClass.field ?? martClass.kind}`);
  }
}

async function insertCandidate(db, rows, hooks = {}) {
  for (const row of rows) await db.query(INSERT_OBSERVATION, officialObservationValues(row));
  await hooks.afterCoreInsert?.(db);
  for (const row of rows) await db.query(INSERT_MART, [row.id]);
  await hooks.afterMartInsert?.(db);
}

async function assertCandidateValidations(db, rows) {
  for (const validation of buildCandidateValidations(rows.map((row) => row.id))) {
    if (asCount(await db.query(validation.sql, validation.params)) !== 0) {
      throw new AtomicValidationError("candidate_validation_failed", validation.name);
    }
  }
}

const RPC_BULK_SQL = `
  select result.*
  from unnest($1::text[]) requested(geography_id)
  cross join lateral public.get_official_suburb_metrics_v1(requested.geography_id) result`;

const VIEW_BULK_SQL = `
  select geography_id, metric, property_type, bedroom_group, period_end,
         value, unit, sample_size, status, source_id, attribution
  from public.v_official_suburb_metric_v1
  where geography_id = any($1::text[])
    and metric = any($2::text[])
    and period_end = any($3::date[])`;

async function assertConsumerSurfaces(db, rows) {
  const geographies = [...new Set(rows.map((row) => row.geo))];
  const rpcRows = (await db.query(RPC_BULK_SQL, [geographies])).rows;
  let rpcChecked = 0;
  for (const row of rows) {
    const matches = rpcRows.filter((result) => (
      result.geography_id === row.geo
      && result.metric === row.metric
      && result.property_type === row.pt
      && result.bedroom_group === row.bg
      && normaliseComparableField("period_end", result.period_end) === row.pe
      && result.source_id === row.src
    ));
    if (matches.length !== 1) throw new AtomicValidationError("rpc_candidate_cardinality", candidateMartKey(row));
    const result = matches[0];
    const expected = candidateMartFields(row);
    if (!sameFields(expected, result, MART_COMPARE_FIELDS)) throw new AtomicValidationError("rpc_candidate_mismatch", candidateMartKey(row));
    if (Boolean(result.is_derived) !== (row.status === "derived")) throw new AtomicValidationError("rpc_derived_flag_mismatch", row.id);
    if ((row.status === "derived" ? result.derived_from : null) !== (row.formula ?? null)) throw new AtomicValidationError("rpc_lineage_mismatch", row.id);
    rpcChecked += 1;
  }

  const viewRows = (await db.query(VIEW_BULK_SQL, [
    geographies,
    [...new Set(rows.map((row) => row.metric))],
    [...new Set(rows.map((row) => row.pe))],
  ])).rows;
  let viewChecked = 0;
  for (const row of rows) {
    const matches = viewRows.filter((result) => candidateMartKey({
      geo: result.geography_id,
      metric: result.metric,
      pt: result.property_type,
      bg: result.bedroom_group,
      pe: normaliseComparableField("period_end", result.period_end),
    }) === candidateMartKey(row));
    const expectedCount = row.status === "direct" ? 1 : 0;
    if (matches.length !== expectedCount) throw new AtomicValidationError("direct_view_visibility_mismatch", candidateMartKey(row));
    if (matches[0] && !sameFields(candidateMartFields(row), matches[0], MART_COMPARE_FIELDS)) {
      throw new AtomicValidationError("direct_view_candidate_mismatch", candidateMartKey(row));
    }
    viewChecked += 1;
  }
  return { rpc_rows_checked: rpcChecked, direct_view_rows_checked: viewChecked };
}

/**
 * Run the full candidate load, validation, consumer-surface check and idempotent
 * replay inside one transaction, then intentionally ROLLBACK even on success.
 */
export async function runRollbackValidation({ db, rows, ctx, hooks = {} }) {
  assertRows(rows, ctx);
  let transactionOpen = false;
  let beforeSnapshot;
  try {
    await db.query("begin");
    transactionOpen = true;
    const readiness = await assertSchemaReady(db);
    beforeSnapshot = await readSnapshot(db, rows);
    const coreClasses = rows.map((row) => classifyExistingCore(row, beforeSnapshot.core.get(row.id)));
    const martClasses = rows.map((row) => classifyExistingMart(row, beforeSnapshot.mart.get(candidateMartKey(row))));
    const deltas = computeExpectedDeltas(coreClasses, martClasses);
    if (deltas.has_conflict) throw new AtomicValidationError("preexisting_candidate_conflict", String(deltas.conflicts.length));

    await hooks.beforeLoad?.(db);
    await insertCandidate(db, rows, hooks);
    const firstSnapshot = await readSnapshot(db, rows);
    assertSnapshotExact(firstSnapshot, rows);
    const actualCoreDelta = firstSnapshot.core.size - beforeSnapshot.core.size;
    const actualMartDelta = firstSnapshot.mart.size - beforeSnapshot.mart.size;
    if (actualCoreDelta !== deltas.expected_core_delta) throw new AtomicValidationError("core_delta_mismatch", `${actualCoreDelta}!=${deltas.expected_core_delta}`);
    if (actualMartDelta !== deltas.expected_mart_delta) throw new AtomicValidationError("mart_delta_mismatch", `${actualMartDelta}!=${deltas.expected_mart_delta}`);

    await hooks.beforeValidations?.(db);
    await assertCandidateValidations(db, rows);
    const surfaces = await assertConsumerSurfaces(db, rows);
    await hooks.afterValidations?.(db);

    await insertCandidate(db, rows);
    const secondSnapshot = await readSnapshot(db, rows);
    assertSnapshotExact(secondSnapshot, rows);
    if (!snapshotsEqual(firstSnapshot, secondSnapshot, rows)) throw new AtomicValidationError("idempotent_replay_changed_candidate");

    await db.query("rollback");
    transactionOpen = false;
    const result = {
      ok: true,
      rolled_back: true,
      retained_rows: false,
      ...readiness,
      ...deltas,
      actual_core_delta: actualCoreDelta,
      actual_mart_delta: actualMartDelta,
      idempotent_replay_delta: 0,
      ...surfaces,
    };
    Object.defineProperty(result, "beforeSnapshot", { value: beforeSnapshot, enumerable: false });
    return result;
  } catch (error) {
    if (transactionOpen) {
      try { await db.query("rollback"); } catch { /* preserve the original failure */ }
    }
    if (beforeSnapshot && error && typeof error === "object") {
      Object.defineProperty(error, "beforeSnapshot", { value: beforeSnapshot, enumerable: false });
    }
    throw error;
  }
}

/** Re-read on a fresh connection and prove rollback restored the exact snapshot. */
export async function verifyRollbackResidue({ db, rows, beforeSnapshot }) {
  if (!beforeSnapshot) throw new AtomicValidationError("before_snapshot_missing");
  const after = await readSnapshot(db, rows);
  if (!snapshotsEqual(beforeSnapshot, after, rows)) throw new AtomicValidationError("rollback_residue_detected");
  return {
    ok: true,
    core_rows_restored: after.core.size,
    mart_rows_restored: after.mart.size,
    net_new_core_rows: 0,
    net_new_mart_rows: 0,
  };
}
