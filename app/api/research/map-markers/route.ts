import { NextRequest, NextResponse } from "next/server";
import { getMapMarkers } from "@/lib/warehouse/queries";
import { isWarehousePreviewEnabled, isMultiStateResearchEnabled } from "@/lib/warehouse/env";

// Thin server-side wrapper around get_market_map_markers_v1, needed because
// lib/warehouse/client.ts is server-only by convention (see its own
// comment) — the /research/map client component can't call it directly, so
// this route handler does the fetch server-side and returns JSON. The
// underlying RPC already enforces its own bounding-box/row-limit
// validation (migration 020); this route adds the same feature-flag gate
// as every other /research route rather than a new one.
export async function GET(req: NextRequest) {
  if (!isWarehousePreviewEnabled() || !isMultiStateResearchEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { searchParams } = req.nextUrl;
  const minLat = Number(searchParams.get("minLat"));
  const maxLat = Number(searchParams.get("maxLat"));
  const minLon = Number(searchParams.get("minLon"));
  const maxLon = Number(searchParams.get("maxLon"));
  const geographyType = searchParams.get("type");

  if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)) {
    return NextResponse.json({ error: "minLat, maxLat, minLon, maxLon are required numeric query params" }, { status: 400 });
  }

  const type = geographyType === "SAL" || geographyType === "POA" || geographyType === "LGA" ? geographyType : undefined;
  const markers = await getMapMarkers({ minLat, maxLat, minLon, maxLon }, type, 500);
  return NextResponse.json({ markers });
}
