import { NextRequest, NextResponse } from "next/server";
import { getExportBundle, exportBundleToCsv } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1Error, apiV1GateOrNotFound, CORS_HEADERS } from "@/lib/warehouse/apiV1";

// GET /api/v1/export/:geographyId?format=json|csv
//
// Sprint 12 WS13 — a self-contained, reproducible export: snapshot +
// timeseries + per-metric-family lineage (source, publisher, licence,
// transformation method) bundled together, not just raw numbers. json is
// the full bundle; csv is the timeseries table with a methodology header
// comment block, downloadable directly.
export async function GET(req: NextRequest, { params }: { params: Promise<{ geographyId: string }> }) {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const { geographyId } = await params;
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";

  const bundle = await getExportBundle(geographyId);
  if (!bundle.snapshot) return apiV1Error(`no data found for geography_id '${geographyId}'`, 404);

  if (format === "csv") {
    const csv = exportBundleToCsv(bundle);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${geographyId}_export.csv"`,
        ...CORS_HEADERS,
      },
    });
  }

  return apiV1Ok(bundle);
}
