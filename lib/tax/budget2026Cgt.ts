import { CGT_REGIME_CHANGE_DATE } from "@/lib/tax/budget2026Constants";
import { cpiIndexAt } from "@/lib/tax/budget2026Cpi";
import type { PropertyTypeInput, TaxScenarioId } from "@/lib/tax/budget2026Scenario";

const COMMENCEMENT = new Date(CGT_REGIME_CHANGE_DATE);

export type CgtRegimeApplied =
  | "OLD_50_DISCOUNT"
  | "OLD_NO_DISCOUNT"
  | "APPORTIONMENT"
  | "FULL_NEW_REGIME"
  | "NEW_BUILD_ELECTION_OLD"
  | "NEW_BUILD_ELECTION_NEW"
  | "PRE_CGT_EXEMPT";

export type CalculateCgtResult = {
  saleGrossProceeds: number;
  costBaseUsed: number;
  nominalGain: number;
  preCommencementGain: number | null;
  postCommencementRealGain: number | null;
  carryForwardLossesApplied: number;
  taxableGainAfterDiscount: number;
  cgtPayable: number;
  regimeApplied: CgtRegimeApplied;
  netSaleProceedsAfterCGT: number;
  indexationAmountApplied: number;
  effectiveMarginalRateUsed: number;
  minimumTaxRateBinding: boolean;
  /** Present when new build election compares both regimes */
  newBuildComparison?: {
    oldRegimeTax: number;
    newRegimeTax: number;
  };
};

export type CalculateCgtParams = {
  purchaseDate: Date;
  purchasePrice: number;
  saleDate: Date;
  salePrice: number;
  scenario: TaxScenarioId;
  propertyType: PropertyTypeInput;
  holdingCostsCapitalised: number;
  marginalRate: number;
  carryForwardLossesAtSale: number;
  cpiAnnualPercent: number;
  isPreCGTAsset?: boolean;
  /** Required when isPreCGTAsset and sale on/after commencement */
  marketValueAt1July2027?: number;
  /** Optional override for Case B commencement market value */
  valueAtCommencementOverride?: number;
};

function yearsBetween(a: Date, b: Date): number {
  const msPerYear = 365.25 * 24 * 3600 * 1000;
  return (b.getTime() - a.getTime()) / msPerYear;
}

function taxAtMinimumMarginal(residualGain: number, marginalRate: number): {
  tax: number;
  effectiveRate: number;
  minimumBinding: boolean;
} {
  const rate = Math.max(marginalRate, 0.3);
  return {
    tax: residualGain * rate,
    effectiveRate: rate,
    minimumBinding: marginalRate < 0.3,
  };
}

/**
 * The ATO excludes both the acquisition date and CGT event date when testing
 * 12 months of ownership, so the first eligible event date is one day after
 * the acquisition anniversary.
 */
function isOldRegimeDiscountEligible(purchaseDate: Date, saleDate: Date): boolean {
  const anniversary = new Date(purchaseDate.getTime());
  const originalMonth = anniversary.getMonth();
  anniversary.setFullYear(anniversary.getFullYear() + 1);

  // Keep a leap-day acquisition's anniversary in February.
  if (anniversary.getMonth() !== originalMonth) {
    anniversary.setDate(0);
  }

  anniversary.setDate(anniversary.getDate() + 1);
  anniversary.setHours(0, 0, 0, 0);

  const eventDate = new Date(saleDate.getTime());
  eventDate.setHours(0, 0, 0, 0);
  return eventDate >= anniversary;
}

/** Old regime: losses are applied before any available 50% discount. */
function cgtOldDiscountFull(params: {
  nominalGain: number;
  carryForwardLossesAtSale: number;
  marginalRate: number;
  discountEligible: boolean;
}): { taxableGainAfterDiscount: number; cgtPayable: number; cfApplied: number } {
  const { nominalGain, carryForwardLossesAtSale, marginalRate, discountEligible } = params;
  const cfApplied = Math.min(Math.max(0, carryForwardLossesAtSale), Math.max(0, nominalGain));
  const residual = Math.max(0, nominalGain - cfApplied);
  const taxableGainAfterDiscount = residual * (discountEligible ? 0.5 : 1);
  const cgtPayable = taxableGainAfterDiscount * marginalRate;
  return { taxableGainAfterDiscount, cgtPayable, cfApplied };
}

export function calculateCGT(p: CalculateCgtParams): CalculateCgtResult {
  const {
    purchaseDate,
    purchasePrice,
    saleDate,
    salePrice,
    propertyType,
    holdingCostsCapitalised,
    marginalRate,
    carryForwardLossesAtSale,
    cpiAnnualPercent,
    isPreCGTAsset = false,
    marketValueAt1July2027,
    valueAtCommencementOverride,
  } = p;

  const costBase = purchasePrice + Math.max(0, holdingCostsCapitalised);
  const nominalGain = Math.max(0, salePrice - costBase);

  const saleBeforeCommencement = saleDate < COMMENCEMENT;
  const oldRegimeDiscountEligible = isOldRegimeDiscountEligible(purchaseDate, saleDate);

  // Pre-CGT asset — full exemption if sold before commencement
  if (isPreCGTAsset && saleBeforeCommencement) {
    return {
      saleGrossProceeds: salePrice,
      costBaseUsed: costBase,
      nominalGain,
      preCommencementGain: null,
      postCommencementRealGain: null,
      carryForwardLossesApplied: 0,
      taxableGainAfterDiscount: 0,
      cgtPayable: 0,
      regimeApplied: "PRE_CGT_EXEMPT",
      netSaleProceedsAfterCGT: salePrice,
      indexationAmountApplied: 0,
      effectiveMarginalRateUsed: marginalRate,
      minimumTaxRateBinding: false,
    };
  }

  const isNewBuild = propertyType === "new_build";

  // Case A — temporal
  if (saleBeforeCommencement) {
    const old = cgtOldDiscountFull({
      nominalGain,
      carryForwardLossesAtSale,
      marginalRate,
      discountEligible: oldRegimeDiscountEligible,
    });
    return {
      saleGrossProceeds: salePrice,
      costBaseUsed: costBase,
      nominalGain,
      preCommencementGain: null,
      postCommencementRealGain: null,
      carryForwardLossesApplied: old.cfApplied,
      taxableGainAfterDiscount: old.taxableGainAfterDiscount,
      cgtPayable: old.cgtPayable,
      regimeApplied: oldRegimeDiscountEligible ? "OLD_50_DISCOUNT" : "OLD_NO_DISCOUNT",
      netSaleProceedsAfterCGT: salePrice - old.cgtPayable,
      indexationAmountApplied: 0,
      effectiveMarginalRateUsed: marginalRate,
      minimumTaxRateBinding: false,
    };
  }

  // --- Sale on or after 1 July 2027 ---

  const heldAtCommencement = purchaseDate < COMMENCEMENT;
  const acquiredOnOrAfterCommencement = purchaseDate >= COMMENCEMENT;

  const buildOldResult = (old: ReturnType<typeof cgtOldDiscountFull>): Omit<
    CalculateCgtResult,
    "regimeApplied"
  > => ({
    saleGrossProceeds: salePrice,
    costBaseUsed: costBase,
    nominalGain,
    preCommencementGain: null,
    postCommencementRealGain: null,
    carryForwardLossesApplied: old.cfApplied,
    taxableGainAfterDiscount: old.taxableGainAfterDiscount,
    cgtPayable: old.cgtPayable,
    netSaleProceedsAfterCGT: salePrice - old.cgtPayable,
    indexationAmountApplied: 0,
    effectiveMarginalRateUsed: marginalRate,
    minimumTaxRateBinding: false,
  });

  // Pre-CGT / cost base reset at commencement — index from 1 July 2027 (not original acquisition)
  if (isPreCGTAsset) {
    const mv =
      marketValueAt1July2027 ??
      (() => {
        throw new Error("marketValueAt1July2027 required for pre-CGT asset sold after commencement");
      })();
    const idxAtSaleFromCommencement = cpiIndexAt(COMMENCEMENT, cpiAnnualPercent, saleDate);
    const indexedCost = mv * (idxAtSaleFromCommencement / 100);
    const realGain = Math.max(0, salePrice - indexedCost);
    const cfApplied = Math.min(Math.max(0, carryForwardLossesAtSale), realGain);
    const residual = Math.max(0, realGain - cfApplied);
    const { tax, effectiveRate, minimumBinding } = taxAtMinimumMarginal(residual, marginalRate);
    return {
      saleGrossProceeds: salePrice,
      costBaseUsed: mv,
      nominalGain: Math.max(0, salePrice - mv),
      preCommencementGain: null,
      postCommencementRealGain: realGain,
      carryForwardLossesApplied: cfApplied,
      taxableGainAfterDiscount: residual,
      cgtPayable: tax,
      regimeApplied: "FULL_NEW_REGIME",
      netSaleProceedsAfterCGT: salePrice - tax,
      indexationAmountApplied: indexedCost - mv,
      effectiveMarginalRateUsed: effectiveRate,
      minimumTaxRateBinding: minimumBinding,
    };
  }

  if (isNewBuild) {
    const oldStyle = cgtOldDiscountFull({
      nominalGain,
      carryForwardLossesAtSale,
      marginalRate,
      discountEligible: oldRegimeDiscountEligible,
    });

    const newStyle = acquiredOnOrAfterCommencement
      ? cgtFullNewRegime({
          purchaseDate,
          purchasePrice: costBase,
          saleDate,
          salePrice,
          carryForwardLossesAtSale,
          marginalRate,
          cpiAnnualPercent,
        })
      : cgtApportionment({
          purchaseDate,
          purchasePrice: costBase,
          saleDate,
          salePrice,
          carryForwardLossesAtSale,
          marginalRate,
          cpiAnnualPercent,
          valueAtCommencementOverride,
          oldRegimeDiscountEligible,
        });

    const pickOld = oldStyle.cgtPayable <= newStyle.cgtPayable;
    if (pickOld) {
      return {
        ...buildOldResult(oldStyle),
        regimeApplied: "NEW_BUILD_ELECTION_OLD",
        newBuildComparison: {
          oldRegimeTax: oldStyle.cgtPayable,
          newRegimeTax: newStyle.cgtPayable,
        },
      };
    }
    return {
      ...newStyle,
      regimeApplied: "NEW_BUILD_ELECTION_NEW",
      newBuildComparison: {
        oldRegimeTax: oldStyle.cgtPayable,
        newRegimeTax: newStyle.cgtPayable,
      },
    };
  }

  if (acquiredOnOrAfterCommencement) {
    return cgtFullNewRegime({
      purchaseDate,
      purchasePrice: costBase,
      saleDate,
      salePrice,
      carryForwardLossesAtSale,
      marginalRate,
      cpiAnnualPercent,
    });
  }

  if (heldAtCommencement) {
    return cgtApportionment({
      purchaseDate,
      purchasePrice: costBase,
      saleDate,
      salePrice,
      carryForwardLossesAtSale,
      marginalRate,
      cpiAnnualPercent,
      valueAtCommencementOverride,
      oldRegimeDiscountEligible,
    });
  }

  // Fallback
  const old = cgtOldDiscountFull({
    nominalGain,
    carryForwardLossesAtSale,
    marginalRate,
    discountEligible: oldRegimeDiscountEligible,
  });
  return {
    ...buildOldResult(old),
    regimeApplied: oldRegimeDiscountEligible ? "OLD_50_DISCOUNT" : "OLD_NO_DISCOUNT",
  };
}

function cgtFullNewRegime(params: {
  purchaseDate: Date;
  purchasePrice: number;
  saleDate: Date;
  salePrice: number;
  carryForwardLossesAtSale: number;
  marginalRate: number;
  cpiAnnualPercent: number;
}): CalculateCgtResult {
  const {
    purchaseDate,
    purchasePrice,
    saleDate,
    salePrice,
    carryForwardLossesAtSale,
    marginalRate,
    cpiAnnualPercent,
  } = params;

  const idxPurchase = cpiIndexAt(purchaseDate, cpiAnnualPercent, purchaseDate);
  const idxSale = cpiIndexAt(purchaseDate, cpiAnnualPercent, saleDate);
  const indexedCostBase = purchasePrice * (idxSale / idxPurchase);
  const realGain = Math.max(0, salePrice - indexedCostBase);
  const cfApplied = Math.min(Math.max(0, carryForwardLossesAtSale), realGain);
  const residual = Math.max(0, realGain - cfApplied);
  const { tax, effectiveRate, minimumBinding } = taxAtMinimumMarginal(residual, marginalRate);

  return {
    saleGrossProceeds: salePrice,
    costBaseUsed: purchasePrice,
    nominalGain: Math.max(0, salePrice - purchasePrice),
    preCommencementGain: null,
    postCommencementRealGain: realGain,
    carryForwardLossesApplied: cfApplied,
    taxableGainAfterDiscount: residual,
    cgtPayable: tax,
    regimeApplied: "FULL_NEW_REGIME",
    netSaleProceedsAfterCGT: salePrice - tax,
    indexationAmountApplied: indexedCostBase - purchasePrice,
    effectiveMarginalRateUsed: effectiveRate,
    minimumTaxRateBinding: minimumBinding,
  };
}

function cgtApportionment(params: {
  purchaseDate: Date;
  purchasePrice: number;
  saleDate: Date;
  salePrice: number;
  carryForwardLossesAtSale: number;
  marginalRate: number;
  cpiAnnualPercent: number;
  valueAtCommencementOverride?: number;
  oldRegimeDiscountEligible: boolean;
}): CalculateCgtResult {
  const {
    purchaseDate,
    purchasePrice,
    saleDate,
    salePrice,
    carryForwardLossesAtSale,
    marginalRate,
    cpiAnnualPercent,
    valueAtCommencementOverride,
    oldRegimeDiscountEligible,
  } = params;

  const totalYears = Math.max(1e-9, yearsBetween(purchaseDate, saleDate));
  const yearsToCommencement = Math.min(
    Math.max(0, yearsBetween(purchaseDate, COMMENCEMENT)),
    totalYears
  );

  const valueAtCommencement =
    valueAtCommencementOverride ??
    purchasePrice + (salePrice - purchasePrice) * (yearsToCommencement / totalYears);

  const preGain = Math.max(0, valueAtCommencement - purchasePrice);
  const cpiAtCommencement = cpiIndexAt(purchaseDate, cpiAnnualPercent, COMMENCEMENT);
  const cpiAtSale = cpiIndexAt(purchaseDate, cpiAnnualPercent, saleDate);
  const indexedCommencementValue = valueAtCommencement * (cpiAtSale / cpiAtCommencement);
  const realPostGain = Math.max(0, salePrice - indexedCommencementValue);

  const cfApplied = Math.min(Math.max(0, carryForwardLossesAtSale), realPostGain);
  const residualPost = Math.max(0, realPostGain - cfApplied);
  const { tax: taxPost, effectiveRate, minimumBinding } = taxAtMinimumMarginal(
    residualPost,
    marginalRate
  );

  const taxablePre = preGain * (oldRegimeDiscountEligible ? 0.5 : 1);
  const taxPre = taxablePre * marginalRate;

  const nominalGain = Math.max(0, salePrice - purchasePrice);

  return {
    saleGrossProceeds: salePrice,
    costBaseUsed: purchasePrice,
    nominalGain,
    preCommencementGain: preGain,
    postCommencementRealGain: realPostGain,
    carryForwardLossesApplied: cfApplied,
    taxableGainAfterDiscount: taxablePre + residualPost,
    cgtPayable: taxPre + taxPost,
    regimeApplied: "APPORTIONMENT",
    netSaleProceedsAfterCGT: salePrice - (taxPre + taxPost),
    indexationAmountApplied: indexedCommencementValue - valueAtCommencement,
    effectiveMarginalRateUsed: effectiveRate,
    minimumTaxRateBinding: minimumBinding,
  };
}
