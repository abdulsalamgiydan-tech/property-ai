import type { DatasetFreshness, EvidenceCatalogueEntry } from "@/lib/warehouse/queries";

export type ResearchHubSummary = {
  datasetCount: number;
  sourceCount: number;
  /**
   * Datasets promoted to the branch and queryable via the public research
   * interfaces. This — not orchestrator refresh recency — is the evidence that
   * the research product actually works, and it maps to the same emerald
   * "healthy" state the /research/data-status page uses for `branch_published`.
   */
  publishedDatasetCount: number;
  /** Datasets a refresh run has confirmed current within their cadence window. */
  currentDatasetCount: number;
  /** Datasets in a genuine problem state that warrants review (see ATTENTION_STATUSES). */
  attentionDatasetCount: number;
  /** Most recent real data-retrieval timestamp; null when no orchestrator run has recorded one. */
  latestRetrievedAt: string | null;
  /** Most recent time the freshness status itself was computed — a real, populated timestamp. */
  latestComputedAt: string | null;
  statusLabel: "available" | "partial" | "unavailable";
};

// Only genuine problems belong here. `manual_review` is intentionally excluded:
// per the /research/data-status page's own semantics it means "built directly,
// not yet run through the orchestrator" — a documented, no-action-needed state,
// not something wrong with the data. `local_only` is handled separately (it is
// "not published" rather than "needs attention").
const ATTENTION_STATUSES = new Set([
  "due",
  "stale",
  "failed",
  "blocked",
  "source_unavailable",
  "validation_failed",
]);

// Statuses that mean the dataset is promoted to the branch and queryable.
const PUBLISHED_STATUSES = new Set(["current", "branch_published", "succeeded"]);

function isPublished(d: DatasetFreshness): boolean {
  return d.local_only_or_branch_published === "branch_published" || PUBLISHED_STATUSES.has(d.freshness_status);
}

export function buildResearchHubSummary(datasets: DatasetFreshness[], sources: EvidenceCatalogueEntry[]): ResearchHubSummary {
  const latestRetrievedAt = datasets
    .map((d) => d.last_retrieved_at)
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  const latestComputedAt = datasets
    .map((d) => d.computed_at)
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  const currentDatasetCount = datasets.filter((d) => d.freshness_status === "current").length;
  const publishedDatasetCount = datasets.filter(isPublished).length;
  const attentionDatasetCount = datasets.filter((d) => ATTENTION_STATUSES.has(d.freshness_status)).length;
  const datasetCount = datasets.length;

  // Health is evidence-based: "available" requires every dataset to be
  // published (queryable) with nothing in a genuine attention state. Anything
  // published-but-incomplete or with a problem is "partial"; no datasets at all
  // is "unavailable". A healthy label is never produced from an empty list.
  let statusLabel: ResearchHubSummary["statusLabel"] = "unavailable";
  if (datasetCount > 0 && attentionDatasetCount === 0 && publishedDatasetCount === datasetCount) {
    statusLabel = "available";
  } else if (datasetCount > 0 || sources.length > 0) {
    statusLabel = "partial";
  }

  return {
    datasetCount,
    sourceCount: sources.length,
    publishedDatasetCount,
    currentDatasetCount,
    attentionDatasetCount,
    latestRetrievedAt,
    latestComputedAt,
    statusLabel,
  };
}

export function formatSummaryDate(value: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
