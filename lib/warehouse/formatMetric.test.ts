import { describe, expect, it } from "vitest";
import {
  formatCountOrUnavailable,
  formatMoneyOrUnavailable,
  formatPeriodOrUnavailable,
  formatPercentOrUnavailable,
} from "./formatMetric";

describe("formatMoneyOrUnavailable", () => {
  it("renders a real zero as a zero amount, not Unavailable", () => {
    expect(formatMoneyOrUnavailable(0)).not.toBe("Unavailable");
    expect(formatMoneyOrUnavailable(0)).toContain("0");
  });
  it("renders null/undefined as Unavailable", () => {
    expect(formatMoneyOrUnavailable(null)).toBe("Unavailable");
    expect(formatMoneyOrUnavailable(undefined)).toBe("Unavailable");
  });
  it("formats a positive value as AUD currency", () => {
    expect(formatMoneyOrUnavailable(1_350_000)).toMatch(/1,350,000/);
  });
});

describe("formatPercentOrUnavailable", () => {
  it("renders a real zero percent as 0%, not Unavailable", () => {
    expect(formatPercentOrUnavailable(0)).not.toBe("Unavailable");
    expect(formatPercentOrUnavailable(0)).toBe("0.0%");
  });
  it("renders null/undefined as Unavailable", () => {
    expect(formatPercentOrUnavailable(null)).toBe("Unavailable");
    expect(formatPercentOrUnavailable(undefined)).toBe("Unavailable");
  });
});

describe("formatCountOrUnavailable", () => {
  it("renders a real zero count as 0, not Unavailable", () => {
    expect(formatCountOrUnavailable(0)).toBe("0");
  });
  it("renders null/undefined as Unavailable", () => {
    expect(formatCountOrUnavailable(null)).toBe("Unavailable");
    expect(formatCountOrUnavailable(undefined)).toBe("Unavailable");
  });
  it("formats large counts with en-AU grouping", () => {
    expect(formatCountOrUnavailable(12345)).toBe("12,345");
  });
});

describe("formatPeriodOrUnavailable", () => {
  it("renders null/undefined as n/a", () => {
    expect(formatPeriodOrUnavailable(null)).toBe("n/a");
    expect(formatPeriodOrUnavailable(undefined)).toBe("n/a");
  });
  it("stringifies a present period", () => {
    expect(formatPeriodOrUnavailable("2026-Q1")).toBe("2026-Q1");
    expect(formatPeriodOrUnavailable(2026)).toBe("2026");
  });
});
