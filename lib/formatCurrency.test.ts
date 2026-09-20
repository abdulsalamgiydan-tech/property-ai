import { describe, expect, it } from "vitest";

import { formatInputNumber } from "@/lib/formatCurrency";

describe("formatInputNumber", () => {
  it("normalises negative decimals without a leading zero", () => {
    expect(formatInputNumber("-.5")).toBe("-0.5");
    expect(formatInputNumber("-.50")).toBe("-0.50");
  });

  it("preserves valid decimal input while applying grouping", () => {
    expect(formatInputNumber(".5")).toBe("0.5");
    expect(formatInputNumber("-0.5")).toBe("-0.5");
    expect(formatInputNumber("1,234.56")).toBe("1,234.56");
  });
});
