import { describe, expect, it } from "vitest";
import { METRIC_GLOSSARY, type MetricFamily } from "./metricGlossary";

const ALL_FAMILIES: MetricFamily[] = [
  "sales",
  "rent",
  "yield",
  "approvals",
  "dwelling_stock",
  "demographics",
  "population_growth",
  "affordability",
];

describe("METRIC_GLOSSARY", () => {
  it("has a glossary entry for every metric family AboutThisMetric can render", () => {
    for (const family of ALL_FAMILIES) {
      expect(METRIC_GLOSSARY[family]).toBeDefined();
    }
  });

  it("every entry has a non-empty plain-English definition and confidence meaning", () => {
    for (const family of ALL_FAMILIES) {
      const entry = METRIC_GLOSSARY[family];
      expect(entry.definition.length).toBeGreaterThan(10);
      expect(entry.confidenceMeaning.length).toBeGreaterThan(10);
      expect(entry.knownLimitations.length).toBeGreaterThan(10);
    }
  });

  it("never leaks raw SQL or internal schema names into the definition text", () => {
    for (const family of ALL_FAMILIES) {
      const entry = METRIC_GLOSSARY[family];
      const text = `${entry.definition} ${entry.formula ?? ""} ${entry.confidenceMeaning} ${entry.knownLimitations}`.toLowerCase();
      expect(text).not.toMatch(/select |create table|mart\.|core\.|staging\./);
    }
  });
});
