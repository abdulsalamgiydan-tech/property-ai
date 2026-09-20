import type { ComparePropertyFormSnapshot } from "@/components/compare/useComparePropertyFormSlice";
import type { InvestmentStrategyId } from "@/lib/investmentStrategy";
import type { SnapshotPeriod } from "@/lib/keySnapshotDisplay";
import type { PropertyAnalysisInputs } from "@/lib/propertyAnalysis";

const ANALYSE_KEY = "property-ai:analyse-draft:v1";
const COMPARE_KEY = "property-ai:compare-draft:v1";

export type AnalyseDraftV1 = {
  v: 1;
  suburb: string;
  propertyAddress: string;
  state: string;
  suburbGrowthPercent: string;
  vacancyPercent: string;
  purchasePrice: string;
  weeklyRent: string;
  rentalGrowthRate: string;
  interestRate: string;
  isInterestOnly: boolean;
  investmentStrategy: InvestmentStrategyId;
  loanTermYears: string;
  depositPercent: string;
  annualExpenses: string;
  expensesGrowthRate: string;
  pmFeePercent: string;
  preTaxSalary: string;
  yearBuilt: string;
  buildingValuePercent: string;
  fixturesEstimate: string;
  snapshotPeriod: SnapshotPeriod;
  cashflowView: "annual" | "weekly" | "monthly";
  suburbSuggestionActive: boolean;
  savedInputs: PropertyAnalysisInputs | null;
  purchaseDate?: string;
  propertyType?: "established" | "new_build";
  otherRentalIncome?: string;
  cpiAssumptionPercent?: string;
  saleDate?: string;
  salePrice?: string;
  holdingCostsCapitalised?: string;
  isPreCGTAsset?: boolean;
  marketValueAt1July2027?: string;
};

export type CompareChartTab = "overlay" | "propertyA" | "propertyB";

export type CompareDraftV1 = {
  v: 1;
  investmentStrategy: InvestmentStrategyId;
  propertyA: ComparePropertyFormSnapshot;
  propertyB: ComparePropertyFormSnapshot;
  savedInputA: PropertyAnalysisInputs | null;
  savedInputB: PropertyAnalysisInputs | null;
  valueChartTab: CompareChartTab;
  cashflowChartTab: CompareChartTab;
};

function readJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readStoredJson<T>(key: string): T | null {
  try {
    return readJson<T>(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function loadAnalyseDraft(): AnalyseDraftV1 | null {
  if (typeof window === "undefined") return null;
  const d = readStoredJson<AnalyseDraftV1>(ANALYSE_KEY);
  if (!d || d.v !== 1) return null;
  return d;
}

export function saveAnalyseDraft(draft: AnalyseDraftV1): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ANALYSE_KEY, JSON.stringify(draft));
  } catch {
    /* quota or private mode */
  }
}

export function loadCompareDraft(): CompareDraftV1 | null {
  if (typeof window === "undefined") return null;
  const d = readStoredJson<CompareDraftV1>(COMPARE_KEY);
  if (!d || d.v !== 1) return null;
  return d;
}

export function saveCompareDraft(draft: CompareDraftV1): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(draft));
  } catch {
    /* quota or private mode */
  }
}
