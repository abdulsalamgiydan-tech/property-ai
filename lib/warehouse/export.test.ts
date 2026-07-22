import { describe, it, expect } from "vitest";
import { exportBundleToCsv, type ExportBundle } from "./queries";

function makeBundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    geography_id: "SAL_12348_ASGS3_2021",
    mart_table: "suburb_market_snapshot",
    exported_at: "2026-07-22T21:00:00.000Z",
    snapshot: null,
    timeseries: [],
    lineage: {},
    ...overrides,
  };
}

describe("exportBundleToCsv", () => {
  it("includes a methodology header comment for every metric family with recorded lineage", () => {
    const bundle = makeBundle({
      lineage: {
        sales: {
          found: true,
          jurisdiction: "NSW",
          row_confidence: "high",
          row_provenance: null,
          is_derived: false,
          transformation_method: "direct_load",
          correspondence_version: null,
          source_name: "NSW Valuer General Property Sales Information",
          publisher: "NSW Valuer General",
          source_url: "https://valuation.property.nsw.gov.au/embed/propertySalesInformation",
          licence: "CC BY 4.0",
          dataset_name: "NSW VG PSI — full state, 2001-current",
          lineage_complete: true,
        },
      },
    });
    const csv = exportBundleToCsv(bundle);
    expect(csv).toMatch(/^# Export: SAL_12348_ASGS3_2021 \(suburb_market_snapshot\)/);
    expect(csv).toContain("# sales: NSW Valuer General Property Sales Information (NSW Valuer General) -- direct_load -- CC BY 4.0");
  });

  it("renders one CSV row per timeseries point with the correct column order", () => {
    const bundle = makeBundle({
      timeseries: [
        {
          geography_id: "SAL_12348_ASGS3_2021",
          geography_type: "SAL",
          reference_period: "2026-01-01",
          period_type: "month",
          dwelling_type: "detached_house",
          metric_family: "sales",
          transaction_count: 2,
          median_sale_price: 2623500,
          median_weekly_rent: null,
          gross_yield_percentage: null,
          approvals_count: null,
          confidence_label: "insufficient",
          source_dataset: "nsw_vg_sales",
          jurisdiction: "NSW",
          state_code: "1",
        },
      ],
    });
    const csv = exportBundleToCsv(bundle);
    const lines = csv.split("\n");
    const headerIdx = lines.findIndex((l) => l.startsWith("reference_period"));
    expect(lines[headerIdx]).toBe("reference_period,period_type,dwelling_type,metric_family,transaction_count,median_sale_price,median_weekly_rent,gross_yield_percentage,approvals_count,confidence_label,source_dataset");
    expect(lines[headerIdx + 1]).toBe("2026-01-01,month,detached_house,sales,2,2623500,,,,insufficient,nsw_vg_sales");
  });

  it("quotes CSV fields containing commas (defends against a source_dataset or confidence_label with embedded punctuation)", () => {
    const bundle = makeBundle({
      timeseries: [
        {
          geography_id: "X",
          geography_type: "SAL",
          reference_period: "2026-01-01",
          period_type: "month",
          dwelling_type: null,
          metric_family: "rent",
          transaction_count: null,
          median_sale_price: null,
          median_weekly_rent: 500,
          gross_yield_percentage: null,
          approvals_count: null,
          confidence_label: "high, verified",
          source_dataset: "test",
          jurisdiction: null,
          state_code: null,
        },
      ],
    });
    const csv = exportBundleToCsv(bundle);
    expect(csv).toContain('"high, verified"');
  });

  it("produces a well-formed export with no timeseries rows and no lineage (an empty-but-valid geography)", () => {
    const csv = exportBundleToCsv(makeBundle());
    expect(csv.split("\n").length).toBeGreaterThanOrEqual(3); // export header, exported-at, csv header
    expect(csv).toContain("reference_period,period_type");
  });
});
