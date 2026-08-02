import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PROMOTION_SCHEMA_DDL, PROMOTION_VALIDATIONS, contractViolationsSql } from "./promotionValidationSql.mjs";
import { qualifyYield } from "../../../lib/warehouse/yieldLineage.mjs";
import { FIXTURES, PARITY_AS_OF, toEvidence, observationValues, martValues } from "./lineageParityFixtures.mjs";

const JS_OPTS = { minSample: 10, asOf: PARITY_AS_OF, maxEndLagDays: 400, freshnessSlaDays: 400, maxWindowRatio: 2 };
const OBS_PLACEHOLDERS = "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18";
const MART_PLACEHOLDERS = "$1,$2,$3,$4,$5,$6,$7,$8";

describe("promotion validation SQL executes against real PostgreSQL (PGlite)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(PROMOTION_SCHEMA_DDL);
  });

  it("date - date returns integer days (the corrected period rule)", async () => {
    const res = await db.query<{ d: number }>(`select (date '2026-06-30' - date '2025-06-30') as d`);
    expect(Number(res.rows[0].d)).toBe(365);
  });

  it("the named subset checks execute (return an integer count)", async () => {
    for (const v of PROMOTION_VALIDATIONS) {
      const res = await db.query<{ violations: number }>(v.sql);
      expect(Number(res.rows[0].violations)).toBeGreaterThanOrEqual(0);
    }
  });

  // JS ↔ PostgreSQL parity: for every fixture, the JS canonical qualifier and the
  // full-contract SQL must reach the SAME verdict (and match the fixture's expectation).
  it.each(FIXTURES)("parity: $name", async (fx) => {
    // JS side
    const jsQualified = qualifyYield(toEvidence(fx), JS_OPTS).qualified;
    expect(jsQualified).toBe(fx.expectedQualified);

    // SQL side — isolate this fixture in a clean schema state
    await db.exec(`truncate core.market_observation; truncate mart.suburb_yield_recovered;`);
    await db.query(`insert into core.market_observation values (${OBS_PLACEHOLDERS})`, observationValues(fx.price));
    await db.query(`insert into core.market_observation values (${OBS_PLACEHOLDERS})`, observationValues(fx.rent));
    await db.query(`insert into mart.suburb_yield_recovered values (${MART_PLACEHOLDERS})`, martValues(fx));
    const res = await db.query<{ violations: number }>(contractViolationsSql(), [PARITY_AS_OF]);
    const sqlQualified = Number(res.rows[0].violations) === 0;

    expect(sqlQualified).toBe(jsQualified); // JS and real PostgreSQL agree
    expect(sqlQualified).toBe(fx.expectedQualified);
  });
});
