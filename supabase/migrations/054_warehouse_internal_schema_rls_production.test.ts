import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("054_warehouse_internal_schema_rls_production.sql", () => {
  const sql = fs.readFileSync(path.join(__dirname, "054_warehouse_internal_schema_rls_production.sql"), "utf8");
  const lower = sql.toLowerCase();

  const expectedTables = [
    "core.dim_geography",
    "mart.suburb_market_snapshot",
    "mart.postcode_market_snapshot",
    "mart.suburb_demographic_profile_2021",
    "mart.postcode_demographic_profile_2021",
    "mart.suburb_market_timeseries",
    "mart.postcode_market_timeseries",
    "mart.suburb_rent_quarterly",
    "mart.postcode_rent_quarterly",
    "mart.lga_rent_quarterly",
    "meta.dataset",
    "meta.source",
    "meta.dataset_freshness_status",
    "meta.dataset_refresh_run",
    "meta.metric_lineage_registry",
    "meta.metric_assumption",
    "meta.jurisdiction",
    "meta.data_incident",
    "meta.data_quality_rule",
    "meta.data_quality_run",
    "meta.data_quarantine_summary",
  ];

  // 32 tables that exist on warehouse-validation (migration 047's scope)
  // but are NOT part of Production's 21-table minimum contract -- this
  // migration must never reference any of them, since they don't exist on
  // Production and the statement would fail immediately.
  const outOfScopeTables = [
    "core.dim_geography_version",
    "core.bridge_geography_relationship",
    "core.bridge_geography_correspondence",
    "core.fact_dwelling_stock",
    "core.fact_household_tenure",
    "core.fact_building_approvals",
    "core.fact_residential_sales_summary",
    "core.fact_rental_market_summary",
    "core.fact_interest_rates",
    "core.fact_dwelling_construction_activity",
    "mart.suburb_dwelling_stock_2021",
    "mart.postcode_dwelling_stock_2021",
    "mart.sa2_dwelling_stock_2021",
    "mart.lga_dwelling_stock_2021",
    "mart.suburb_building_approvals",
    "mart.postcode_building_approvals",
    "mart.suburb_sales_monthly",
    "mart.suburb_sales_annual",
    "mart.postcode_sales_monthly",
    "mart.postcode_sales_annual",
    "mart.suburb_yield_quarterly",
    "mart.postcode_yield_quarterly",
    "mart.national_interest_rate_context",
    "meta.source_file",
    "meta.coverage_result",
    "meta.publication_approval",
    "meta.load_run",
    "meta.data_quality_result",
    "staging.asgs_geography",
    "staging.asgs_correspondence",
    "staging.census_dwelling_stock",
  ];

  it("does not drop, truncate, or write data, and adds no policies", () => {
    expect(lower).not.toMatch(/^\s*drop\s+/im);
    expect(lower).not.toMatch(/^\s*truncate\s+/im);
    expect(lower).not.toMatch(/^\s*delete\s+from\s+/im);
    expect(lower).not.toMatch(/^\s*insert\s+into\s+/im);
    expect(lower).not.toMatch(/create policy/);
  });

  it("enables RLS on exactly the 21 tables in the minimum contract", () => {
    const alterLines = sql.split("\n").filter((l) => l.trim().toLowerCase().startsWith("alter table"));
    expect(alterLines).toHaveLength(21);
    for (const table of expectedTables) {
      expect(lower).toContain(`alter table ${table} enable row level security`);
    }
  });

  it("never references any of the 32 warehouse-validation-only tables outside Production's minimum contract", () => {
    for (const table of outOfScopeTables) {
      expect(lower).not.toContain(table);
    }
  });
});
