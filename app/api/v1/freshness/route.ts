import { getDatasetFreshness } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";

// GET /api/v1/freshness — per-dataset freshness status (Sprint 10, now
// exposed on the versioned public surface by WS11).
export async function GET() {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const datasets = await getDatasetFreshness();
  return apiV1Ok({ datasets, count: datasets.length });
}
