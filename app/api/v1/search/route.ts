import { NextRequest } from "next/server";
import { searchGeographiesV2 } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";

// GET /api/v1/search?q=<text>&jurisdiction=NSW&type=SAL&limit=20
export async function GET(req: NextRequest) {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? undefined;
  const jurisdictionParam = searchParams.get("jurisdiction");
  const jurisdiction = jurisdictionParam === "NSW" || jurisdictionParam === "VIC" ? jurisdictionParam : undefined;
  const typeParam = searchParams.get("type");
  const geographyType = typeParam === "SAL" || typeParam === "POA" ? typeParam : undefined;
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

  const results = await searchGeographiesV2({ query: q, jurisdiction, geographyType, limit });
  return apiV1Ok({ results, count: results.length });
}
