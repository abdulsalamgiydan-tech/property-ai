import { NextRequest } from "next/server";
import { getMapMarkers } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1Error, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";

// GET /api/v1/map-markers?minLat=&maxLat=&minLon=&maxLon=&type=SAL|POA|LGA
export async function GET(req: NextRequest) {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const { searchParams } = req.nextUrl;
  const minLat = Number(searchParams.get("minLat"));
  const maxLat = Number(searchParams.get("maxLat"));
  const minLon = Number(searchParams.get("minLon"));
  const maxLon = Number(searchParams.get("maxLon"));
  if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)) {
    return apiV1Error("minLat, maxLat, minLon, maxLon are required numeric query params", 400);
  }

  const typeParam = searchParams.get("type");
  const geographyType = typeParam === "SAL" || typeParam === "POA" || typeParam === "LGA" ? typeParam : undefined;
  const markers = await getMapMarkers({ minLat, maxLat, minLon, maxLon }, geographyType, 500);
  return apiV1Ok({ markers, count: markers.length });
}
