import { describe, expect, it } from "vitest";
import {
  CANONICAL_DWELLING_TYPES,
  isCanonicalRentalSummaryShape,
  isCanonicalSalesTransactionShape,
  sampleSizeConfidence,
  type CanonicalRentalSummary,
  type CanonicalSalesTransaction,
} from "./contracts";

// Fixture mirrors a real row shape from core.fact_residential_sales_summary /
// nsw_sales_transactions_raw (Sprint 5-10), mapped into the canonical
// contract field names — proves the Sprint 10 refactor did not change what
// NSW actually produces, only how it's documented/typed.
const nswSalesFixture: CanonicalSalesTransaction = {
  jurisdiction: "NSW",
  source_transaction_id: "121|4567891|1|2025-03-14", // district_code|property_id|sale_counter|contract_date
  source_version: null,
  contract_date: "2025-03-14",
  settlement_date: "2025-04-20",
  sale_price: 950000,
  property_address_raw: "14 East Cres",
  locality_raw: "PARRAMATTA",
  postcode_raw: "2150",
  property_type_raw: "RESIDENCE",
  dwelling_type_canonical: "townhouse_villa_semidetached",
  classification_confidence: "medium",
  transaction_status: null,
  market_transaction_flag: true,
  nominal_transfer_flag: false,
  outlier_flag: false,
  geography_id_sal: "SAL_13167_ASGS3_2021",
  geography_id_poa: "POA_2150_ASGS3_2021",
  source_id: "nsw_vg_sales",
  dataset_id: "nsw_psi_2001_current_full_state",
  source_file_id: "00000000-0000-0000-0000-000000000000",
  load_run_id: "00000000-0000-0000-0000-000000000000",
  retrieved_at: "2026-07-20T00:00:00.000Z",
};

const nswRentalFixture: CanonicalRentalSummary = {
  jurisdiction: "NSW",
  geography_type: "SAL",
  geography_code: "13167",
  reference_period: "2026-01-01",
  dwelling_type: "all",
  bedroom_count: null,
  median_weekly_rent: 679,
  rental_count: 42,
  direct_or_derived: "derived", // NSW suburb rent is derived via POA->SAL correspondence
  confidence_label: "high",
};

// Sprint 10: VIC fixtures, proving the SAME shared contract (not a
// per-jurisdiction redefinition) is satisfied by Victoria's VPSR/Homes
// Victoria adapter output. VIC's sales source is a pre-aggregated summary
// (no source_transaction_id in the NSW sense), so this fixture uses the
// dataset_id + reference_period as its natural key — a legitimate
// jurisdiction-specific value, not a contract violation (the contract only
// requires the field to be present and a string, not a specific format).
const vicSalesFixture: CanonicalSalesTransaction = {
  jurisdiction: "VIC",
  source_transaction_id: "vic_vpsr_median_house|SAL_20830_ASGS3_2021|2025-10-01",
  source_version: null,
  contract_date: null, // VPSR publishes a quarter median, not individual contract dates
  settlement_date: null,
  sale_price: 3125000,
  property_address_raw: null, // VPSR has no per-property address (aggregate source)
  locality_raw: "EAST MELBOURNE",
  postcode_raw: null, // VPSR publishes no postcode grain
  property_type_raw: "house",
  dwelling_type_canonical: "detached_house",
  classification_confidence: "high", // VPSR's own house/unit/land split needs no inference
  transaction_status: null,
  market_transaction_flag: true,
  nominal_transfer_flag: false,
  outlier_flag: false,
  geography_id_sal: "SAL_20830_ASGS3_2021",
  geography_id_poa: null,
  source_id: "vic_vg_sales",
  dataset_id: "vic_vpsr_median_house",
  source_file_id: "00000000-0000-0000-0000-000000000000",
  load_run_id: "00000000-0000-0000-0000-000000000000",
  retrieved_at: "2026-07-21T00:00:00.000Z",
};

const vicRentalFixture: CanonicalRentalSummary = {
  jurisdiction: "VIC",
  geography_type: "SAL",
  geography_code: "20830",
  reference_period: "2025-10-01",
  dwelling_type: "all",
  bedroom_count: null,
  median_weekly_rent: 650,
  rental_count: null, // VIC's "All properties" sheet publishes count only for some quarters
  direct_or_derived: "direct", // Homes Victoria publishes suburb rent directly, unlike NSW's POA->SAL derivation
  confidence_label: "high",
};

describe("canonical sales transaction contract", () => {
  it("NSW's row shape satisfies the canonical contract", () => {
    expect(isCanonicalSalesTransactionShape(nswSalesFixture)).toBe(true);
  });

  it("dwelling_type_canonical must be one of the 6 shared vocabulary values", () => {
    expect(CANONICAL_DWELLING_TYPES).toContain(nswSalesFixture.dwelling_type_canonical);
    const invalid = { ...nswSalesFixture, dwelling_type_canonical: "duplex" as never };
    expect(isCanonicalSalesTransactionShape(invalid)).toBe(false);
  });

  it("rejects a row missing a required field (e.g. a hypothetical VIC adapter bug)", () => {
    const { market_transaction_flag: _drop, ...incomplete } = nswSalesFixture;
    expect(isCanonicalSalesTransactionShape(incomplete)).toBe(false);
  });

  it("VIC's VPSR-derived row satisfies the SAME shared contract as NSW — not a per-jurisdiction redefinition", () => {
    expect(isCanonicalSalesTransactionShape(vicSalesFixture)).toBe(true);
    expect(CANONICAL_DWELLING_TYPES).toContain(vicSalesFixture.dwelling_type_canonical);
  });

  it("VIC and NSW rows share the identical required-key set (proves no jurisdiction-specific field set)", () => {
    const nswKeys = Object.keys(nswSalesFixture).sort();
    const vicKeys = Object.keys(vicSalesFixture).sort();
    expect(vicKeys).toEqual(nswKeys);
  });
});

describe("canonical rental summary contract", () => {
  it("NSW's derived suburb rent row satisfies the canonical contract", () => {
    expect(isCanonicalRentalSummaryShape(nswRentalFixture)).toBe(true);
  });

  it("direct_or_derived must be explicitly set — never silently omitted", () => {
    const { direct_or_derived: _drop, ...incomplete } = nswRentalFixture;
    expect(isCanonicalRentalSummaryShape(incomplete)).toBe(false);
  });

  it("VIC's direct Homes Victoria row satisfies the SAME shared contract as NSW's derived row", () => {
    expect(isCanonicalRentalSummaryShape(vicRentalFixture)).toBe(true);
    expect(vicRentalFixture.direct_or_derived).toBe("direct");
    expect(nswRentalFixture.direct_or_derived).toBe("derived");
  });

  it("geography_type accepts LGA — VIC's documented rent fallback grain for unmappable localities", () => {
    const lgaFixture: CanonicalRentalSummary = { ...vicRentalFixture, geography_type: "LGA", geography_code: "20910" };
    expect(isCanonicalRentalSummaryShape(lgaFixture)).toBe(true);
  });
});

describe("sampleSizeConfidence (shared, never redefined per state)", () => {
  it("matches NSW's established thresholds exactly", () => {
    expect(sampleSizeConfidence(30)).toBe("high");
    expect(sampleSizeConfidence(29)).toBe("medium");
    expect(sampleSizeConfidence(10)).toBe("medium");
    expect(sampleSizeConfidence(9)).toBe("low");
    expect(sampleSizeConfidence(5)).toBe("low");
    expect(sampleSizeConfidence(4)).toBe("insufficient");
    expect(sampleSizeConfidence(0)).toBe("insufficient");
    expect(sampleSizeConfidence(null)).toBe("insufficient");
  });
});
