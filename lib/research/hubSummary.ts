import type { DatasetFreshness, EvidenceCatalogueEntry } from "@/lib/warehouse/queries";

export type ResearchHubSummary = {
  datasetCount: number;
  sourceCount: number;
  currentDatasetCount: number;
  attentionDatasetCount: number;
  latestRetrievedAt: string | null;
  statusLabel: "available" | "partial" | "unavailable";
};

const ATTENTION_STATUSES = new Set(["due", "stale", "failed", "blocked", "manual_review"]);

export function buildResearchHubSummary(datasets: DatasetFreshness[], sources: EvidenceCatalogueEntry[]): ResearchHubSummary {
  const latestRetrievedAt = datasets
    .map((d) => d.last_retrieved_at)
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  const currentDatasetCount = datasets.filter((d) => d.freshness_status === "current").length;
  const attentionDatasetCount = datasets.filter((d) => ATTENTION_STATUSES.has(d.freshness_status)).length;
  const datasetCount = datasets.length;

  let statusLabel: ResearchHubSummary["statusLabel"] = "unavailable";
  if (datasetCount > 0 && currentDatasetCount === datasetCount) statusLabel = "available";
  else if (datasetCount > 0 || sources.length > 0) statusLabel = "partial";

  return {
    datasetCount,
    sourceCount: sources.length,
    currentDatasetCount,
    attentionDatasetCount,
    latestRetrievedAt,
    statusLabel,
  };
}

export function formatSummaryDate(value: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}