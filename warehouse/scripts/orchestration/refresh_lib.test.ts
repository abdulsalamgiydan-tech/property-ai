import { describe, it, expect, vi } from "vitest";
import { affectedDatasets, withRetry, filterByDomain, filterByJurisdiction } from "./refresh_lib.mjs";

const SAMPLE_DATASETS = [
  { dataset_id: "geo", tier: 0, category: "geography", jurisdiction: "ALL", depends_on: [] },
  { dataset_id: "census", tier: 1, category: "census", jurisdiction: "ALL", depends_on: ["geo"] },
  { dataset_id: "nsw_sales", tier: 2, category: "sales", jurisdiction: "NSW", depends_on: ["geo"] },
  { dataset_id: "nsw_rent", tier: 2, category: "rent", jurisdiction: "NSW", depends_on: ["geo"] },
  { dataset_id: "rba_rates", tier: 2, category: "macro", jurisdiction: "ALL", depends_on: [] },
  { dataset_id: "nsw_snapshot", tier: 3, category: "snapshot", jurisdiction: "NSW", depends_on: ["nsw_sales", "nsw_rent", "census", "rba_rates"] },
  { dataset_id: "nsw_lineage", tier: 4, category: "lineage", jurisdiction: "NSW", depends_on: ["nsw_snapshot"] },
];

describe("affectedDatasets — dependency-aware selection", () => {
  it("a geography change invalidates every dependent mart transitively, not just direct dependents", () => {
    const affected = affectedDatasets(SAMPLE_DATASETS, "geo").map((d) => d.dataset_id);
    expect(affected).toEqual(expect.arrayContaining(["geo", "census", "nsw_sales", "nsw_rent", "nsw_snapshot", "nsw_lineage"]));
    // rba_rates has no dependency on geo -- must NOT be pulled in.
    expect(affected).not.toContain("rba_rates");
  });

  it("a rate change rebuilds only the snapshot/affordability outputs that depend on it, not unrelated supply facts", () => {
    const affected = affectedDatasets(SAMPLE_DATASETS, "rba_rates").map((d) => d.dataset_id);
    expect(affected).toEqual(expect.arrayContaining(["rba_rates", "nsw_snapshot", "nsw_lineage"]));
    expect(affected).not.toContain("nsw_sales");
    expect(affected).not.toContain("nsw_rent");
  });

  it("a rent change rebuilds rent and downstream yield/snapshot outputs but not unrelated sales-only or supply datasets", () => {
    const affected = affectedDatasets(SAMPLE_DATASETS, "nsw_rent").map((d) => d.dataset_id);
    expect(affected).toEqual(expect.arrayContaining(["nsw_rent", "nsw_snapshot", "nsw_lineage"]));
    expect(affected).not.toContain("nsw_sales");
  });

  it("a leaf dataset with nothing depending on it only affects itself", () => {
    const affected = affectedDatasets(SAMPLE_DATASETS, "nsw_lineage").map((d) => d.dataset_id);
    expect(affected).toEqual(["nsw_lineage"]);
  });

  it("results are returned in tier order (dependency-safe execution order)", () => {
    const affected = affectedDatasets(SAMPLE_DATASETS, "geo");
    for (let i = 1; i < affected.length; i++) expect(affected[i].tier).toBeGreaterThanOrEqual(affected[i - 1].tier);
  });

  it("throws on an unknown dataset_id rather than silently returning nothing", () => {
    expect(() => affectedDatasets(SAMPLE_DATASETS, "not_a_real_dataset")).toThrow(/unknown dataset_id/);
  });
});

describe("filterByDomain / filterByJurisdiction", () => {
  it("filters by category (the registry's existing domain concept)", () => {
    expect(filterByDomain(SAMPLE_DATASETS, "rent").map((d) => d.dataset_id)).toEqual(["nsw_rent"]);
  });
  it("no domain filter returns everything unchanged", () => {
    expect(filterByDomain(SAMPLE_DATASETS, null)).toBe(SAMPLE_DATASETS);
  });
  it("filters by jurisdiction, always including ALL-jurisdiction datasets", () => {
    const nsw = filterByJurisdiction(SAMPLE_DATASETS, "NSW").map((d) => d.dataset_id);
    expect(nsw).toEqual(expect.arrayContaining(["geo", "census", "nsw_sales", "nsw_rent", "rba_rates", "nsw_snapshot", "nsw_lineage"]));
    const vic = filterByJurisdiction(SAMPLE_DATASETS, "VIC").map((d) => d.dataset_id);
    expect(vic).toEqual(expect.arrayContaining(["geo", "census", "rba_rates"]));
    expect(vic).not.toContain("nsw_sales");
  });
});

describe("withRetry — bounded retry with exponential backoff", () => {
  it("succeeds immediately without retrying when the operation succeeds first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { sleep: async () => {} });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient-looking failure up to maxAttempts, with exponentially increasing delay", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValueOnce("ok");
    const delays = [];
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, sleep: async (ms) => delays.push(ms) });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]);
  });

  it("gives up and throws after exhausting maxAttempts on a persistently transient failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(withRetry(fn, { maxAttempts: 3, sleep: async () => {} })).rejects.toThrow("ETIMEDOUT");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a deterministic failure (e.g. a SQL syntax error) -- retrying it would waste time reproducing the same result", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("syntax error at or near \"nul\""));
    await expect(withRetry(fn, { maxAttempts: 3, sleep: async () => {} })).rejects.toThrow(/syntax error/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry with the attempt number and delay before each retry", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce("ok");
    const onRetry = vi.fn();
    await withRetry(fn, { baseDelayMs: 50, sleep: async () => {}, onRetry });
    expect(onRetry).toHaveBeenCalledWith(1, 50, expect.any(Error));
  });
});
