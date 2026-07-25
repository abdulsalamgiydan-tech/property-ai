import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postcodeToState } from "../lib/postcode_to_state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("postcodeToState (Australia Post range heuristic)", () => {
  it("resolves known postcodes to the correct state", () => {
    expect(postcodeToState("2000")).toBe("1"); // NSW — Sydney
    expect(postcodeToState("0800")).toBe("7"); // NT — Darwin
    expect(postcodeToState("3000")).toBe("2"); // VIC — Melbourne
    expect(postcodeToState("4000")).toBe("3"); // QLD — Brisbane
    expect(postcodeToState("5000")).toBe("4"); // SA — Adelaide
    expect(postcodeToState("6000")).toBe("5"); // WA — Perth
    expect(postcodeToState("7000")).toBe("6"); // TAS — Hobart
    expect(postcodeToState("2601")).toBe("8"); // ACT — Canberra
  });

  it("returns null for malformed or out-of-range codes rather than guessing", () => {
    expect(postcodeToState("10102100701")).toBeNull();
    expect(postcodeToState("1GSYD")).toBeNull();
    expect(postcodeToState(null)).toBeNull();
  });
});

describe("rollup_national_market_snapshot — script safety pattern", () => {
  it("defaults to dry-run and refuses a production connection string", () => {
    const src = fs.readFileSync(path.join(__dirname, "rollup_national_market_snapshot.mjs"), "utf8");
    expect(src).toMatch(/oshquaxsloolqucwvigc/);
    expect(src).toMatch(/EXECUTE = process\.argv\.includes\("--execute"\)/);
    expect(src).toMatch(/lzonauinzatmtytyoems/);
  });

  it("only backfills rent where the snapshot cell is currently NULL (never overwrites NSW/VIC's pipeline values)", () => {
    const src = fs.readFileSync(path.join(__dirname, "rollup_national_market_snapshot.mjs"), "utf8");
    expect(src).toMatch(/s\.median_weekly_rent_latest is null/);
  });
});
