import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  AtomicValidationError, runRollbackValidation, verifyRollbackResidue,
} from "./atomicRollbackValidation.mjs";
import {
  SA_HOUSE_PRICE_BATCH, candidateBatchToRows, candidateMartFields, officialObservationValues,
} from "./saHousePricePromotion.mjs";
import { INSERT_MART, INSERT_OBSERVATION } from "./officialPromotion.mjs";

const M056 = fs.readFileSync("supabase/migrations/056_official_suburb_metrics.sql", "utf8");
const M057 = fs.readFileSync("supabase/migrations/057_official_suburb_metrics_consumer_rpc.sql", "utf8");
const M058 = fs.readFileSync("supabase/migrations/058_signed_price_growth_constraint.sql", "utf8");

const TEST_CTX = { ...SA_HOUSE_PRICE_BATCH, rowCap: 4 };
const observations = [
  { metric: "median_sale_price_detached", geographyId: "40085", propertyType: "house", reportingPeriod: "2026-06-30", value: 1455000, sampleSize: 16, periodStart: "2026-04-01" },
  { metric: "annual_price_growth_12m", geographyId: "40085", propertyType: "house", reportingPeriod: "2026-06-30", value: -6.11, sampleSize: 16, periodStart: "2025-06-30" },
  { metric: "median_sale_price_detached", geographyId: "40806", propertyType: "house", reportingPeriod: "2026-06-30", value: 1520000, sampleSize: 22, periodStart: "2026-04-01" },
  { metric: "annual_price_growth_12m", geographyId: "40806", propertyType: "house", reportingPeriod: "2026-06-30", value: 8.4, sampleSize: 22, periodStart: "2025-06-30" },
];
const ROWS = candidateBatchToRows(observations, TEST_CTX);
const databases: PGlite[] = [];

async function freshDb(versions = ["056", "057", "058"]) {
  const db = new PGlite();
  databases.push(db);
  await db.exec("create role anon; create role authenticated;");
  await db.exec(M056);
  await db.exec(M057);
  await db.exec(M058);
  await db.exec("create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key);");
  for (const version of versions) await db.query("insert into supabase_migrations.schema_migrations(version) values ($1)", [version]);
  return db;
}

async function seedExact(db: PGlite, row = ROWS[0]) {
  await db.query(INSERT_OBSERVATION, officialObservationValues(row));
  await db.query(INSERT_MART, [row.id]);
}

async function candidateCount(db: PGlite) {
  const result = await db.query<{ count: number }>(
    "select count(*)::int count from core.official_observation where observation_id = any($1::text[])",
    [ROWS.map((row) => row.id)],
  );
  return Number(result.rows[0].count);
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.close()));
});

describe("rollback-only remote validation orchestrator (PGlite)", () => {
  it("validates the candidate, RPC and direct-view semantics, then restores zero residue", async () => {
    const db = await freshDb();
    const result = await runRollbackValidation({ db, rows: ROWS, ctx: TEST_CTX });
    expect(result).toMatchObject({
      ok: true,
      rolled_back: true,
      retained_rows: false,
      expected_core_delta: 4,
      expected_mart_delta: 4,
      actual_core_delta: 4,
      actual_mart_delta: 4,
      idempotent_replay_delta: 0,
      rpc_rows_checked: 4,
      direct_view_rows_checked: 4,
    });
    expect(await candidateCount(db)).toBe(0);
    await expect(verifyRollbackResidue({ db, rows: ROWS, beforeSnapshot: result.beforeSnapshot }))
      .resolves.toMatchObject({ net_new_core_rows: 0, net_new_mart_rows: 0 });
  });

  it("does not reapply migration 058 and requires its ledger entry plus physical constraint", async () => {
    const db = await freshDb();
    await runRollbackValidation({ db, rows: ROWS, ctx: TEST_CTX });
    const constraints = await db.query<{ count: number }>(
      "select count(*)::int count from pg_constraint where conname='official_observation_value_bounds'",
    );
    expect(Number(constraints.rows[0].count)).toBe(1);

    const missingLedger = await freshDb(["056", "057"]);
    await expect(runRollbackValidation({ db: missingLedger, rows: ROWS, ctx: TEST_CTX }))
      .rejects.toMatchObject({ code: "required_migrations_missing" });

    const missingStructure = await freshDb();
    await missingStructure.exec("drop function public.get_official_suburb_metrics_v1(text)");
    await expect(runRollbackValidation({ db: missingStructure, rows: ROWS, ctx: TEST_CTX }))
      .rejects.toMatchObject({ code: "required_structure_missing" });
  });

  it("preserves exact pre-existing candidate rows and simulates only exact new deltas", async () => {
    const db = await freshDb();
    await seedExact(db, ROWS[0]);
    const result = await runRollbackValidation({ db, rows: ROWS, ctx: TEST_CTX });
    expect(result).toMatchObject({
      core_exact_existing: 1,
      mart_exact_existing: 1,
      expected_core_delta: 3,
      expected_mart_delta: 3,
      actual_core_delta: 3,
      actual_mart_delta: 3,
    });
    expect(await candidateCount(db)).toBe(1);
    await expect(verifyRollbackResidue({ db, rows: ROWS, beforeSnapshot: result.beforeSnapshot })).resolves.toMatchObject({
      core_rows_restored: 1,
      mart_rows_restored: 1,
    });
  });

  it("fails closed on conflicting core content without overwriting it", async () => {
    const db = await freshDb();
    await db.query(INSERT_OBSERVATION, officialObservationValues({ ...ROWS[0], val: ROWS[0].val + 1 }));
    await expect(runRollbackValidation({ db, rows: ROWS, ctx: TEST_CTX }))
      .rejects.toMatchObject({ code: "preexisting_candidate_conflict" });
    const stored = await db.query<{ value: number }>("select value from core.official_observation where observation_id=$1", [ROWS[0].id]);
    expect(Number(stored.rows[0].value)).toBe(ROWS[0].val + 1);
  });

  it("fails closed on a conflicting mart natural key before inserting core rows", async () => {
    const db = await freshDb();
    const row = ROWS[0];
    const mart = candidateMartFields(row);
    await db.query(
      `insert into mart.official_suburb_metric
       (geography_id,metric,property_type,bedroom_group,value,unit,sample_size,period_end,status,source_id,attribution)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [row.geo, row.metric, row.pt, row.bg, Number(mart.value) + 1, mart.unit, mart.sample_size, row.pe, mart.status, mart.source_id, mart.attribution],
    );
    await expect(runRollbackValidation({ db, rows: ROWS, ctx: TEST_CTX }))
      .rejects.toMatchObject({ code: "preexisting_candidate_conflict" });
    expect(await candidateCount(db)).toBe(0);
  });

  it.each([
    ["after core insert", { afterCoreInsert: async () => { throw new Error("injected_after_core"); } }],
    ["after mart insert", { afterMartInsert: async () => { throw new Error("injected_after_mart"); } }],
    ["before validations", { beforeValidations: async () => { throw new Error("injected_before_validation"); } }],
    ["after validations", { afterValidations: async () => { throw new Error("injected_after_validation"); } }],
  ])("rolls back an injected failure %s", async (_name, hooks) => {
    const db = await freshDb();
    let failure: unknown;
    try {
      await runRollbackValidation({ db, rows: ROWS, ctx: TEST_CTX, hooks });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeTruthy();
    expect(await candidateCount(db)).toBe(0);
    const snapshot = (failure as { beforeSnapshot?: unknown }).beforeSnapshot;
    await expect(verifyRollbackResidue({ db, rows: ROWS, beforeSnapshot: snapshot })).resolves.toMatchObject({
      net_new_core_rows: 0,
      net_new_mart_rows: 0,
    });
  });

  it("rolls back when a post-load consumer check detects tampering", async () => {
    const db = await freshDb();
    await expect(runRollbackValidation({
      db,
      rows: ROWS,
      ctx: TEST_CTX,
      hooks: {
        beforeValidations: async (connection: PGlite) => {
          await connection.query("delete from mart.official_suburb_metric where geography_id=$1 and metric=$2", [ROWS[0].geo, ROWS[0].metric]);
        },
      },
    })).rejects.toBeInstanceOf(AtomicValidationError);
    expect(await candidateCount(db)).toBe(0);
  });

  it("refuses partial, duplicate-id and duplicate-natural-key candidates before any write", async () => {
    const db = await freshDb();
    await expect(runRollbackValidation({ db, rows: ROWS.slice(0, 3), ctx: TEST_CTX }))
      .rejects.toMatchObject({ code: "unexpected_row_count" });
    await expect(runRollbackValidation({ db, rows: [ROWS[0], ROWS[0], ROWS[2], ROWS[3]], ctx: TEST_CTX }))
      .rejects.toMatchObject({ code: "duplicate_observation_id" });
    await expect(runRollbackValidation({
      db,
      rows: [ROWS[0], { ...ROWS[1], id: `${ROWS[1].id}-different`, metric: ROWS[0].metric }, ROWS[2], ROWS[3]],
      ctx: TEST_CTX,
    })).rejects.toMatchObject({ code: "duplicate_mart_natural_key" });
    expect(await candidateCount(db)).toBe(0);
  });
});
