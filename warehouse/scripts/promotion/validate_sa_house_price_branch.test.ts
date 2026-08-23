import { afterEach, describe, expect, it, vi } from "vitest";
import { dryRun, executionIntent } from "./validate_sa_house_price_branch.mjs";

const savedExit = process.exitCode;
afterEach(() => { process.exitCode = savedExit; vi.restoreAllMocks(); });

describe("SA house-price validation harness — dry run", () => {
  it("validates the plan against the committed report and performs ZERO database writes", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = dryRun();
    // No database connection is ever opened in the dry-run path.
    expect(result.connectedToDatabase).toBe(false);
    expect(result.ok).toBe(true);
    // The committed report's checksum, fingerprint, cap and direct/derived split all pass.
    const names = result.checks.filter((c) => c.pass).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining([
      "checksum_matches_report",
      "schema_fingerprint_matches_report",
      "exact_row_count",
      "classification_split_direct_derived",
      "target_schema_supports_batch",
    ]));
    log.mockRestore();
  });

  it("requires rollback-only execution and rejects retain/cleanup/commit modes", () => {
    expect(executionIntent(["--execute", "--branch-ref", "branchref"]).rollbackValidation).toBe(false);
    expect(executionIntent(["--execute", "--rollback-validation", "--branch-ref", "branchref"]))
      .toMatchObject({ execute: true, rollbackValidation: true, branchRef: "branchref", forbidden: [] });
    expect(executionIntent(["--execute", "--rollback-validation", "--retain", "--cleanup"]).forbidden)
      .toEqual(["--retain", "--cleanup"]);
  });
});
