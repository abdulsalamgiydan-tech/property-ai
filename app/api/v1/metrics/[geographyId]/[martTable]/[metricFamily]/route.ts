import { getMetricLineage, METRIC_FAMILIES, type MetricFamily } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1Error, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";

// GET /api/v1/metrics/:geographyId/:martTable/:metricFamily
// e.g. /api/v1/metrics/SAL_30007_ASGS3_2021/suburb_market_snapshot/rent
// The "About this metric" endpoint (Sprint 12 WS8's lineage, exposed
// publicly for the first time by WS11): source, publisher, licence,
// transformation method, and this specific geography's own confidence/
// provenance for the requested metric family.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ geographyId: string; martTable: string; metricFamily: string }> }
) {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const { geographyId, martTable, metricFamily } = await params;
  if (martTable !== "suburb_market_snapshot" && martTable !== "postcode_market_snapshot") {
    return apiV1Error(`unknown martTable '${martTable}' — must be 'suburb_market_snapshot' or 'postcode_market_snapshot'`, 400);
  }
  if (!METRIC_FAMILIES.includes(metricFamily as MetricFamily)) {
    return apiV1Error(`unknown metricFamily '${metricFamily}' — must be one of: ${METRIC_FAMILIES.join(", ")}`, 400);
  }

  const lineage = await getMetricLineage(geographyId, martTable, metricFamily as MetricFamily);
  if (!lineage || !lineage.found) return apiV1Error(`no ${martTable} row found for geography_id '${geographyId}'`, 404);
  return apiV1Ok(lineage);
}
