import { apiV1Ok, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";

// GET /api/v1 — discovery root: lists every available v1 endpoint.
export async function GET() {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  return apiV1Ok({
    name: "property-ai research API",
    version: "v1",
    documentation: "warehouse/docs/PUBLIC_API_V1_CONTRACT.md",
    endpoints: [
      { path: "/api/v1/search", method: "GET", description: "Search geographies by name/code, filter by jurisdiction/type." },
      { path: "/api/v1/snapshot/:geographyId", method: "GET", description: "Wide market snapshot for one geography." },
      { path: "/api/v1/timeseries/:geographyId", method: "GET", description: "Recent-trend sales/rent/yield/approvals series." },
      { path: "/api/v1/compare", method: "GET", description: "Compare 2-10 geographies side by side (?ids=)." },
      { path: "/api/v1/map-markers", method: "GET", description: "Map markers within a bounding box (?minLat=&maxLat=&minLon=&maxLon=)." },
      { path: "/api/v1/metrics/:geographyId/:martTable/:metricFamily", method: "GET", description: "'About this metric': source, publisher, licence, transformation method, and this geography's own confidence/provenance." },
      { path: "/api/v1/quality", method: "GET", description: "Aggregate data-quality rule and incident summary." },
      { path: "/api/v1/freshness", method: "GET", description: "Per-dataset freshness status." },
      { path: "/api/v1/export/:geographyId", method: "GET", description: "Reproducible export bundle (?format=json|csv) -- snapshot + timeseries + per-metric lineage, downloadable." },
    ],
  });
}
