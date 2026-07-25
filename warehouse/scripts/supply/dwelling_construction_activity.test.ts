import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration test against the REAL build script and REAL ABS Building
// Activity files. Local-only, gitignored inputs -- skips cleanly in a
// clean CI clone rather than failing (matching the pattern established
// in build_2016_2021_geography_bridge.test.ts, Sprint 12 WS4).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const scriptPath = path.join(__dirname, "build_dwelling_construction_activity_local_store.mjs");
const rawDir = path.join(repoRoot, "warehouse", "data", "raw", "abs_building_activity");
const localStorePath = path.join(repoRoot, "warehouse", "data", "local", "dwelling_construction_activity.json");

const hasLocalData = fs.existsSync(path.join(rawDir, "table36.xlsx")) && fs.existsSync(path.join(rawDir, "table39.xlsx"));

type Point = { state_code: string; dwelling_type: string; stage: string; reference_period: string; unit_count: number };
type LocalStore = { points: Point[]; summary_by_state: Record<string, { commenced: number; completed: number }> };

describe.skipIf(!hasLocalData)("build_dwelling_construction_activity_local_store (local-data integration test)", () => {
  let store: LocalStore;

  beforeAll(() => {
    const result = spawnSync("node", [scriptPath], { cwd: repoRoot, encoding: "utf8", timeout: 60000 });
    expect(result.status, `build script failed: ${result.stderr}`).toBe(0);
    store = JSON.parse(fs.readFileSync(localStorePath, "utf8"));
  }, 60000);

  it("extracts data for all 8 states/territories, both stages, both dwelling types", () => {
    const states = new Set(store.points.map((p) => p.state_code));
    expect(states.size).toBe(8);
    const combos = new Set(store.points.map((p) => `${p.stage}|${p.dwelling_type}`));
    expect(combos.size).toBe(4); // commenced/completed x detached_house/attached_dwelling
  });

  it("has no negative unit counts", () => {
    expect(store.points.every((p) => p.unit_count >= 0)).toBe(true);
  });

  it("excludes the 'Australia' national-total column (not a distinct geography)", () => {
    expect(store.points.some((p) => p.state_code === "Australia")).toBe(false);
  });

  it("uses attached_dwelling (not apartment_unit) for ABS's bundled Other Residential category", () => {
    expect(store.points.some((p) => p.dwelling_type === "apartment_unit")).toBe(false);
    expect(store.points.some((p) => p.dwelling_type === "attached_dwelling")).toBe(true);
  });
});

describe("dwelling construction activity — script safety pattern", () => {
  it("load script defaults to dry-run and refuses a production connection string", () => {
    const src = fs.readFileSync(path.join(__dirname, "load_dwelling_construction_activity_to_branch.mjs"), "utf8");
    expect(src).toMatch(/oshquaxsloolqucwvigc/);
    expect(src).toMatch(/EXECUTE = process\.argv\.includes\("--execute"\)/);
    expect(src).toMatch(/on conflict \(geography_id, reference_period, period_type, dwelling_type, stage, sector\) do nothing/);
  });

  it("validate script is read-only", () => {
    const src = fs.readFileSync(path.join(__dirname, "validate_dwelling_construction_activity.mjs"), "utf8");
    expect(src).not.toMatch(/\binsert into\b/i);
    expect(src).not.toMatch(/\bupdate\s+\w+\.\w+\s+set\b/i);
  });
});
