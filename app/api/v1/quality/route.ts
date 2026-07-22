import { getQualitySummary } from "@/lib/warehouse/queries";
import { apiV1Ok, apiV1Error, apiV1GateOrNotFound } from "@/lib/warehouse/apiV1";

// GET /api/v1/quality — WS9's aggregate quality-rule and incident summary.
export async function GET() {
  const gated = apiV1GateOrNotFound();
  if (gated) return gated;

  const summary = await getQualitySummary();
  if (!summary) return apiV1Error("quality summary unavailable", 503);
  return apiV1Ok(summary);
}
