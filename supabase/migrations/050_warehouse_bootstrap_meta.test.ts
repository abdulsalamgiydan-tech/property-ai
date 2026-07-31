import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("050_warehouse_bootstrap_meta.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "050_warehouse_bootstrap_meta.sql"), "utf8");
  const lower = sql.toLowerCase();

  const tables = [
    "jurisdiction",
    "source",
    "dataset",
    "dataset_freshness_status",
    "dataset_refresh_run",
    "metric_assumption",
    "metric_lineage_registry",
    "data_quality_rule",
    "data_quality_run",
    "data_incident",
    "data_quarantine_summary",
  ];

  it("does not drop, truncate, or write data", () => {
    expect(lower).not.toMatch(/drop\s+(table|view|function|schema)/);
    expect(lower).not.toMatch(/truncate/);
    expect(lower).not.toMatch(/delete from/);
    expect(lower).not.toMatch(/insert into/);
  });

  it("creates all 11 meta tables with if-not-exists safety", () => {
    for (const t of tables) {
      expect(lower).toContain(`create table if not exists meta.${t}`);
    }
  });

  it("never creates meta.data_quality_result or meta.load_run -- deliberately out of the minimum contract", () => {
    expect(lower).not.toMatch(/create table[^;]*meta\.data_quality_result/);
    expect(lower).not.toMatch(/create table[^;]*meta\.load_run\b/);
  });

  it("never references data_quality_result or load_run as a foreign-key target", () => {
    expect(lower).not.toMatch(/references meta\.data_quality_result/);
    expect(lower).not.toMatch(/references meta\.load_run/);
  });

  it("keeps the load_run_id/quality_result_id columns as plain nullable uuid columns", () => {
    expect(lower).toMatch(/"load_run_id"\s+uuid,/);
    expect(lower).toMatch(/"first_quality_result_id"\s+uuid,/);
    expect(lower).toMatch(/"latest_quality_result_id"\s+uuid,/);
  });
});
