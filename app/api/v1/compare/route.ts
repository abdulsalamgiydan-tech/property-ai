import { NextRequest } from "next/server";
import { compareMarketGeographies } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1Error, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";

// GET /api/v1/compare?ids=SAL_1,SAL_2,POA_2000  (2-10 geography ids)
export async function GET(req: NextRequest) {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const idsParam = req.nextUrl.searchParams.get("ids");
  if (!idsParam) return apiV1Error("'ids' query param is required (comma-separated, 2-10 geography_id values)", 400);
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length < 2 || ids.length > 10) return apiV1Error("'ids' must contain between 2 and 10 geography_id values", 400);

  const rows = await compareMarketGeographies(ids);
  return apiV1Ok({ geographies: rows, count: rows.length });
}
