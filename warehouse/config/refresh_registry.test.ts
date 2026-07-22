import { describe, it, expect } from "vitest";
import { DATASETS } from "./refresh_registry.mjs";

describe("refresh_registry", () => {
  it("has no duplicate dataset_id values", () => {
    const ids = DATASETS.map((d) => d.dataset_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every depends_on entry references a real dataset_id", () => {
    const ids = new Set(DATASETS.map((d) => d.dataset_id));
    for (const d of DATASETS) {
      for (const dep of d.depends_on) {
        expect(ids.has(dep), `${d.dataset_id} depends on unknown dataset "${dep}"`).toBe(true);
      }
    }
  });

  it("every dependency's tier is strictly lower than its dependent's tier", () => {
    const byId = new Map(DATASETS.map((d) => [d.dataset_id, d]));
    for (const d of DATASETS) {
      for (const depId of d.depends_on) {
        const dep = byId.get(depId);
        expect(dep.tier, `${d.dataset_id} (tier ${d.tier}) depends on ${depId} (tier ${dep.tier}) — dependency must run in an earlier tier`).toBeLessThan(d.tier);
      }
    }
  });

  it("every dataset has at least a build_script or a branch_load_script (never fully empty)", () => {
    for (const d of DATASETS) {
      const hasAnyScript = d.build_script || d.validate_script || d.branch_load_script;
      expect(hasAnyScript, `${d.dataset_id} has no build/validate/branch_load script at all`).toBeTruthy();
    }
  });

  it("every jurisdiction is one of the known values", () => {
    const known = new Set(["ALL", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]);
    for (const d of DATASETS) {
      expect(known.has(d.jurisdiction), `${d.dataset_id} has unknown jurisdiction "${d.jurisdiction}"`).toBe(true);
    }
  });
});
