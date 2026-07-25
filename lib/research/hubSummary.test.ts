import { describe, expect, it } from "vitest";
import { buildResearchHubSummary, formatSummaryDate } from "./hubSummary";
import type { DatasetFreshness, EvidenceCatalogueEntry } from "@/lib/warehouse/queries";

function dataset(overrides: Partial<DatasetFreshness>): DatasetFreshness {
  return {
    dataset_id: "dataset",
    jurisdiction: null,
    dataset_name: null,
    publisher: null,
    latest_source_period: null,
    last_retrieved_at: null,
    last_successful_validation_at: null,
    expected_cadence_days: null,
    freshness_status: "current",
    current_branch_row_count: null,
    last_failure_summary: null,
    local_only_or_branch_published: null,
    source_url: null,
    computed_at: "2026-07-25T00:00:00Z",
    ...overrides,
  };
}

function source(overrides: Partial<EvidenceCatalogueEntry> = {}): EvidenceCatalogueEntry {
  return {
    source_id: "src",
    source_name: "Source",
    publisher: "Publisher",
    source_category: "official",
    official_or_independent: "official",
    source_url: null,
    licence: null,
    access_method: null,
    update_frequency: null,
    implementation_status: "implemented",
    known_limitations: null,
    dataset_count: 1,
    published_metric_family_count: 1,
    ...overrides,
  };
}

describe("buildResearchHubSummary", () => {
  it("marks a fully current warehouse as available", () => {
    const summary = buildResearchHubSummary([
      dataset({ dataset_id: "a", freshness_status: "current", last_retrieved_at: "2026-07-20T00:00:00Z" }),
      dataset({ dataset_id: "b", freshness_status: "current", last_retrieved_at: "2026-07-24T00:00:00Z" }),
    ], [source()]);

    expect(summary.statusLabel).toBe("available");
    expect(summary.currentDatasetCount).toBe(2);
    expect(summary.latestRetrievedAt).toBe("2026-07-24T00:00:00Z");
  });

  it("marks stale or blocked datasets as partial without inventing availability", () => {
    const summary = buildResearchHubSummary([
      dataset({ dataset_id: "a", freshness_status: "current" }),
      dataset({ dataset_id: "b", freshness_status: "manual_review" }),
    ], []);

    expect(summary.statusLabel).toBe("partial");
    expect(summary.attentionDatasetCount).toBe(1);
  });

  it("marks an empty warehouse as unavailable", () => {
    expect(buildResearchHubSummary([], []).statusLabel).toBe("unavailable");
    expect(formatSummaryDate(null)).toBe("Unavailable");
  });
});