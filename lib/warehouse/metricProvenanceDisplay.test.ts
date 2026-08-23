import { describe, it, expect } from "vitest";
import { toDisplayRow } from "./metricProvenanceDisplay";
import { resolveSuburbMetricProvenance } from "./suburbMetricProvenance";
import type { SourceRegistryEntry } from "./metricProvenance";
import registryJson from "../../warehouse/config/v3_source_registry.json";

const registry = registryJson as unknown as SourceRegistryEntry[];
const NOW = new Date("2026-08-23T00:00:00Z");

describe("resolveSuburbMetricProvenance → toDisplayRow (render contract)", () => {
  const vic = resolveSuburbMetricProvenance(
    {
      state_code: "VIC",
      median_sale_price_12m: 1275000,
      annual_price_change_pct: 5.4,
      median_weekly_rent_latest: null,
      gross_yield_pct: null,
      latest_sales_period: "2026-06-30",
      latest_rent_period: null,
      latest_yield_period: null,
    },
    registry,
    NOW,
  );

  it("direct sale price renders formatted AUD with Direct status + VIC source", () => {
    const row = toDisplayRow("Median sale price", vic.salePrice);
    expect(row.value).toBe("$1,275,000");
    expect(row.status).toBe("Direct");
    expect(row.source).toBe("Victorian Property Sales Statistics");
    expect(row.period).toBe("2026-06-30");
    expect(row.freshness).toBe("Fresh");
  });

  it("missing rent renders 'Unavailable' with a reason — never $0", () => {
    const row = toDisplayRow("Median weekly rent", vic.weeklyRent);
    expect(row.value).toBe("Unavailable");
    expect(row.value).not.toContain("0");
    expect(row.status).toBe("Unavailable");
    expect(row.note.length).toBeGreaterThan(0);
  });

  it("growth renders as Derived, not Direct", () => {
    const row = toDisplayRow("12-month price growth", vic.annualGrowth);
    expect(row.status).toBe("Derived");
    expect(row.value).toBe("5.4%");
  });

  it("yield missing → Unavailable + explains it needs price and rent", () => {
    const row = toDisplayRow("Gross yield", vic.grossYield);
    expect(row.value).toBe("Unavailable");
    expect(row.note).toContain("sale-price and a rent");
  });

  it("a state with no source resolves to Unavailable with a source-gap reason", () => {
    const nt = resolveSuburbMetricProvenance(
      {
        state_code: "NT",
        median_sale_price_12m: null,
        annual_price_change_pct: null,
        median_weekly_rent_latest: null,
        gross_yield_pct: null,
        latest_sales_period: null,
        latest_rent_period: null,
        latest_yield_period: null,
      },
      registry,
      NOW,
    );
    const row = toDisplayRow("Median sale price", nt.salePrice);
    expect(row.status).toBe("Unavailable");
    expect(row.note).toContain("No registered sale-price source");
  });
});
