import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PROMOTION_SCHEMA_DDL, PROMOTION_VALIDATIONS } from "./promotionValidationSql.mjs";

// Executes the promotion validation SQL against REAL PostgreSQL (PGlite/WASM),
// so "PostgreSQL-valid" is proven, not asserted.
describe("promotion validation SQL executes against real PostgreSQL", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(PROMOTION_SCHEMA_DDL);
    // A fully-qualified fixture row: house, direct suburb inputs, periods 0 days apart.
    await db.exec(`
      insert into core.market_observation values
        ('obs_p','SAL_1','suburb','house','3',40,'direct','2025-07-01','2026-06-30'),
        ('obs_r','SAL_1','suburb','house','3',35,'direct','2025-07-01','2026-06-30');
      insert into mart.suburb_yield_recovered values
        ('SAL_1', 3.9, 'house', '3', 'obs_p', 'obs_r', '2026-06-30', '2026-06-30', 'gross_yield@2', 'direct');
    `);
  });

  it.each(PROMOTION_VALIDATIONS)("executes '$name' and returns 0 violations for a qualified row", async (v) => {
    const res = await db.query<{ violations: number }>(v.sql);
    expect(res.rows).toHaveLength(1);
    expect(Number(res.rows[0].violations)).toBe(0);
  });

  it("date - date returns integer days (the corrected period rule), not an interval error", async () => {
    const res = await db.query<{ d: number }>(`select (date '2026-06-30' - date '2025-06-30') as d`);
    expect(Number(res.rows[0].d)).toBe(365);
  });

  it("detects a real violation (aggregate 'all' yield) so the checks are meaningful", async () => {
    await db.exec(`insert into mart.suburb_yield_recovered values
      ('SAL_2', 4.0, 'all', 'all', 'obs_p', 'obs_r', '2026-06-30', '2026-06-30', 'gross_yield@2', 'direct');`);
    const check = PROMOTION_VALIDATIONS.find((v) => v.name === "aggregate_property_type")!;
    const res = await db.query<{ violations: number }>(check.sql);
    expect(Number(res.rows[0].violations)).toBe(1);
  });
});
