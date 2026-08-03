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
    const summary = buildResearchHubSummary(
      [
        dataset({ dataset_id: "a", freshness_status: "current", local_only_or_branch_published: "branch_published", last_retrieved_at: "2026-07-20T00:00:00Z" }),
        dataset({ dataset_id: "b", freshness_status: "current", local_only_or_branch_published: "branch_published", last_retrieved_at: "2026-07-24T00:00:00Z" }),
      ],
      [source()]
    );

    expect(summary.statusLabel).toBe("available");
    expect(summary.currentDatasetCount).toBe(2);
    expect(summary.publishedDatasetCount).toBe(2);
    expect(summary.latestRetrievedAt).toBe("2026-07-24T00:00:00Z");
  });

  // Reproduces the exact frozen Production shape: all datasets promoted to the
  // branch (queryable) but never run through the orchestrator, so their status
  // is `manual_review` with a null retrieval timestamp. This must read as a
  // healthy, published warehouse — NOT "needs review" — while still being
  // honest that no per-dataset refresh recency exists.
  it("treats snapshot-loaded branch_published/manual_review datasets as available and published", () => {
    const datasets = Array.from({ length: 7 }, (_, i) =>
      dataset({
        dataset_id: `d${i}`,
        freshness_status: "manual_review",
        local_only_or_branch_published: "branch_published",
        last_retrieved_at: null,
        current_branch_row_count: 500,
        computed_at: "2026-07-22T12:22:10Z",
      })
    );
    const summary = buildResearchHubSummary(datasets, [source(), source({ source_id: "s2" })]);

    expect(summary.statusLabel).toBe("available");
    expect(summary.datasetCount).toBe(7);
    expect(summary.publishedDatasetCount).toBe(7);
    expect(summary.currentDatasetCount).toBe(0);
    expect(summary.attentionDatasetCount).toBe(0);
    expect(summary.latestRetrievedAt).toBeNull();
    expect(summary.latestComputedAt).toBe("2026-07-22T12:22:10Z");
  });

  it("flags genuine problem states as partial and counts them as attention", () => {
    const summary = buildResearchHubSummary(
      [
        dataset({ dataset_id: "a", freshness_status: "branch_published", local_only_or_branch_published: "branch_published" }),
        dataset({ dataset_id: "b", freshness_status: "stale", local_only_or_branch_published: "branch_published" }),
        dataset({ dataset_id: "c", freshness_status: "failed", local_only_or_branch_published: "local_only" }),
      ],
      []
    );

    expect(summary.statusLabel).toBe("partial");
    expect(summary.attentionDatasetCount).toBe(2);
  });

  it("does not count manual_review as attention, but does count unpublished (local_only) as not-published", () => {
    const summary = buildResearchHubSummary(
      [
        dataset({ dataset_id: "a", freshness_status: "branch_published", local_only_or_branch_published: "branch_published" }),
        dataset({ dataset_id: "b", freshness_status: "manual_review", local_only_or_branch_published: "local_only" }),
      ],
      []
    );

    // manual_review is not a problem, so nothing needs attention...
    expect(summary.attentionDatasetCount).toBe(0);
    // ...but one dataset isn't published, so the warehouse isn't fully available.
    expect(summary.publishedDatasetCount).toBe(1);
    expect(summary.statusLabel).toBe("partial");
  });

  it("marks an empty warehouse as unavailable and never fabricates a healthy state", () => {
    const summary = buildResearchHubSummary([], []);
    expect(summary.statusLabel).toBe("unavailable");
    expect(summary.publishedDatasetCount).toBe(0);
    expect(summary.currentDatasetCount).toBe(0);
    expect(summary.latestRetrievedAt).toBeNull();
    expect(summary.latestComputedAt).toBeNull();
    expect(formatSummaryDate(null)).toBe("Unavailable");
  });

  it("treats datasets-present-but-only-sources correctly (partial, not available)", () => {
    const summary = buildResearchHubSummary([], [source()]);
    expect(summary.statusLabel).toBe("partial");
  });
});
