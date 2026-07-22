import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");

describe("Sprint 12 WS9 scripts — safety pattern", () => {
  it("build_rule_catalogue defaults to dry-run and refuses production", () => {
    const src = read("build_rule_catalogue.mjs");
    expect(src).toMatch(/oshquaxsloolqucwvigc/);
    expect(src).toMatch(/EXECUTE = process\.argv\.includes\("--execute"\)/);
  });

  it("run_quality_check defaults to dry-run (no persistence) and refuses production", () => {
    const src = read("run_quality_check.mjs");
    expect(src).toMatch(/oshquaxsloolqucwvigc/);
    expect(src).toMatch(/EXECUTE = process\.argv\.includes\("--execute"\)/);
    expect(src).toMatch(/if \(EXECUTE\)/);
  });

  it("run_quality_check exits non-zero when a blocking rule fails, but never on advisory-only failures", () => {
    const src = read("run_quality_check.mjs");
    expect(src).toMatch(/if \(rulesFailedBlocking > 0\)/);
    expect(src).toMatch(/process\.exit\(1\)/);
    // The advisory counter must exist and be tracked separately from the exit-code decision.
    expect(src).toMatch(/rulesFailedAdvisory/);
  });

  it("run_quality_check's incident handling is idempotent via a database-level ON CONFLICT, not application-only dedup", () => {
    const src = read("run_quality_check.mjs");
    expect(src).toMatch(/on conflict \(unique_signature\) where status = 'open' do update/);
    expect(src).toMatch(/occurrence_count = meta\.data_incident\.occurrence_count \+ 1/);
  });

  it("run_quality_check auto-resolves an incident once its rule passes again", () => {
    const src = read("run_quality_check.mjs");
    expect(src).toMatch(/status = 'resolved'/);
    expect(src).toMatch(/auto-resolved: rule passed on a subsequent run/);
  });

  it("run_quality_check never deletes rows -- quality failures are quarantined, not dropped", () => {
    const src = read("run_quality_check.mjs");
    expect(src).not.toMatch(/\bdelete from\b/i);
    expect(src).toMatch(/data_quarantine_summary/);
  });

  it("quarantine_future_dated_sales never deletes the underlying fact rows", () => {
    const src = read("quarantine_future_dated_sales.mjs");
    expect(src).not.toMatch(/\bdelete from\b/i);
    expect(src).toMatch(/data_quality_status = 'quarantined'/);
    expect(src).toMatch(/EXECUTE = process\.argv\.includes\("--execute"\)/);
  });

  it("report_incidents and quality_report are read-only", () => {
    for (const f of ["report_incidents.mjs", "quality_report.mjs"]) {
      const src = read(f);
      expect(src, `${f} should not write`).not.toMatch(/\binsert into\b|\bupdate\s+\w+\.\w+\s+set\b|\bdelete from\b/i);
    }
  });
});
