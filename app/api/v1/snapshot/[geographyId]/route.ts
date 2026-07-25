import { getMarketSnapshotV2 } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1Error, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";

// GET /api/v1/snapshot/:geographyId
export async function GET(_req: Request, { params }: { params: Promise<{ geographyId: string }> }) {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const { geographyId } = await params;
  const snapshot = await getMarketSnapshotV2(geographyId);
  if (!snapshot) return apiV1Error(`no snapshot found for geography_id '${geographyId}'`, 404);
  return apiV1Ok(snapshot);
}
