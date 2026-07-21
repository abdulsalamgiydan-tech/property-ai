/**
 * Canonical property data contracts (Sprint 10, Phase 2). TypeScript
 * mirror of warehouse/docs/CANONICAL_PROPERTY_DATA_CONTRACTS.md — used by
 * contract tests to assert NSW's branch-resident output still satisfies
 * the shared shape after the state-adapter refactor, and to typecheck any
 * future adapter's local-store row shape before promotion.
 */

export const CANONICAL_DWELLING_TYPES = [
  "detached_house",
  "apartment_unit",
  "townhouse_villa_semidetached",
  "residential_land",
  "other_residential",
  "unknown_residential",
] as const;
export type CanonicalDwellingType = (typeof CANONICAL_DWELLING_TYPES)[number];

export const SAMPLE_SIZE_CONFIDENCE_THRESHOLDS = {
  high: 30,
  medium: 10,
  low: 5,
} as const;

export function sampleSizeConfidence(count: number | null | undefined): "high" | "medium" | "low" | "insufficient" {
  if (count === null || count === undefined) return "insufficient";
  if (count >= SAMPLE_SIZE_CONFIDENCE_THRESHOLDS.high) return "high";
  if (count >= SAMPLE_SIZE_CONFIDENCE_THRESHOLDS.medium) return "medium";
  if (count >= SAMPLE_SIZE_CONFIDENCE_THRESHOLDS.low) return "low";
  return "insufficient";
}

export type Jurisdiction = "NSW" | "VIC";

export interface CanonicalSalesTransaction {
  [key: string]: unknown;
  jurisdiction: Jurisdiction;
  source_transaction_id: string;
  source_version: string | null;
  contract_date: string | null;
  settlement_date: string | null;
  sale_price: number | null;
  property_address_raw: string | null;
  locality_raw: string | null;
  postcode_raw: string | null;
  property_type_raw: string | null;
  dwelling_type_canonical: CanonicalDwellingType;
  classification_confidence: "high" | "medium" | "low";
  transaction_status: string | null;
  market_transaction_flag: boolean;
  nominal_transfer_flag: boolean;
  outlier_flag: boolean;
  geography_id_sal: string | null;
  geography_id_poa: string | null;
  source_id: string;
  dataset_id: string;
  source_file_id: string;
  load_run_id: string;
  retrieved_at: string;
}

export interface CanonicalRentalSummary {
  [key: string]: unknown;
  jurisdiction: Jurisdiction;
  geography_type: "SAL" | "POA" | "LGA";
  geography_code: string;
  reference_period: string;
  dwelling_type: CanonicalDwellingType | "all";
  bedroom_count: number | null;
  median_weekly_rent: number | null;
  rental_count: number | null;
  direct_or_derived: "direct" | "derived";
  confidence_label: "high" | "medium" | "low" | "insufficient";
}

/** Asserts a row satisfies the canonical sales transaction contract's required-field shape. */
export function isCanonicalSalesTransactionShape(row: Record<string, unknown>): boolean {
  const requiredKeys: (keyof CanonicalSalesTransaction)[] = [
    "jurisdiction", "source_transaction_id", "dwelling_type_canonical",
    "classification_confidence", "market_transaction_flag", "nominal_transfer_flag", "outlier_flag",
  ];
  return requiredKeys.every((k) => k in row) && CANONICAL_DWELLING_TYPES.includes(row.dwelling_type_canonical as CanonicalDwellingType);
}

/** Asserts a row satisfies the canonical rental summary contract's required-field shape. */
export function isCanonicalRentalSummaryShape(row: Record<string, unknown>): boolean {
  const requiredKeys: (keyof CanonicalRentalSummary)[] = [
    "jurisdiction", "geography_type", "geography_code", "reference_period",
    "dwelling_type", "direct_or_derived", "confidence_label",
  ];
  return requiredKeys.every((k) => k in row);
}
