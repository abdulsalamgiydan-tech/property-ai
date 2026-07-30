import { NextRequest } from "next/server";
import { getMapMarkers } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1Error, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";
import { validateMapMarkerParams } from "@/lib/warehouse/mapMarkerValidation";

// GET /api/v1/map-markers?minLat=&maxLat=&minLon=&maxLon=&type=SAL|POA|LGA
export async function GET(req: NextRequest) {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const { searchParams } = req.nextUrl;
  const minLat = Number(searchParams.get("minLat"));
  const maxLat = Number(searchParams.get("maxLat"));
  const minLon = Number(searchParams.get("minLon"));
  const maxLon = Number(searchParams.get("maxLon"));
  const typeParam = searchParams.get("type");
  const validation = validateMapMarkerParams({ minLat, maxLat, minLon, maxLon, type: typeParam });
  if (!validation.ok) return apiV1Error(validation.error, 400);

  const markers = await getMapMarkers({ minLat, maxLat, minLon, maxLon }, validation.geographyType, 500);
  return apiV1Ok({ markers, count: markers.length });
}
