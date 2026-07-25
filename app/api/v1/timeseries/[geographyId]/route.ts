import { getTimeseriesV2 } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";

// GET /api/v1/timeseries/:geographyId
export async function GET(_req: Request, { params }: { params: Promise<{ geographyId: string }> }) {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const { geographyId } = await params;
  const series = await getTimeseriesV2(geographyId);
  return apiV1Ok({ geography_id: geographyId, points: series, count: series.length });
}
