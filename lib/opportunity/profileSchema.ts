import { z } from "zod";
import type { InvestmentProfile } from "./types";

/** Validation for the Find My Investment questionnaire payload. */
export const investmentProfileSchema = z.object({
  maxPrice: z.number().positive().max(50_000_000),
  deposit: z.number().min(0).max(50_000_000),
  strategy: z.enum(["growth", "balanced", "yield"]),
  acceptableWeeklyHoldingCost: z.number().min(0).max(20_000),
  propertyType: z.enum(["house", "unit"]),
  states: z.array(z.enum(["SA", "VIC", "NSW", "QLD", "WA", "TAS", "ACT", "NT"])).min(1).max(8),
  riskTolerance: z.enum(["low", "medium", "high"]),
  holdingPeriodYears: z.number().int().min(1).max(40),
});

export type InvestmentProfileInput = z.infer<typeof investmentProfileSchema>;

export function parseProfile(body: unknown): { ok: true; profile: InvestmentProfile } | { ok: false; error: string } {
  const parsed = investmentProfileSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, profile: parsed.data };
}
