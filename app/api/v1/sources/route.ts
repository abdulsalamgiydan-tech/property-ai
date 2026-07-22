import { getEvidenceCatalogue } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";

// GET /api/v1/sources — the research evidence catalogue (Sprint 12 WS5):
// every registered source, its publisher/licence/status, and how many
// published, lineage-tracked metric families it feeds.
export async function GET() {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const sources = await getEvidenceCatalogue();
  return apiV1Ok({ sources, count: sources.length });
}
