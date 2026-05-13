import { BUDGET_NIGHT_CUTOFF_ISO } from "@/lib/tax/budget2026Constants";

export type PropertyTypeInput = "established" | "new_build";

export type TaxScenarioId =
  | "GRANDFATHERED"
  | "POST_BUDGET_ESTABLISHED"
  | "POST_BUDGET_NEW_BUILD";

export function classifyTaxScenario(params: {
  purchaseDate: Date;
  propertyType: PropertyTypeInput;
}): TaxScenarioId {
  const cutoff = new Date(BUDGET_NIGHT_CUTOFF_ISO);
  const { purchaseDate, propertyType } = params;
  if (purchaseDate.getTime() <= cutoff.getTime()) {
    return "GRANDFATHERED";
  }
  if (propertyType === "new_build") {
    return "POST_BUDGET_NEW_BUILD";
  }
  return "POST_BUDGET_ESTABLISHED";
}

export function taxScenarioLabel(id: TaxScenarioId): string {
  switch (id) {
    case "GRANDFATHERED":
      return "Pre-budget rules (grandfathered) — full negative gearing for life";
    case "POST_BUDGET_ESTABLISHED":
      return "Post-budget established property — negative gearing until 30 June 2027, then ring-fenced";
    case "POST_BUDGET_NEW_BUILD":
      return "Post-budget new build — full negative gearing retained";
    default:
      return id;
  }
}
