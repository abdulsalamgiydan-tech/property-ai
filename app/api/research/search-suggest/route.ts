import { NextRequest, NextResponse } from "next/server";
import { searchGeographiesV2 } from "@/lib/warehouse/queries";
import { isWarehousePreviewEnabled, isMultiStateResearchEnabled } from "@/lib/warehouse/env";
import { checkRateLimit } from "@/lib/security/rateLimiter";
import { clientIpKey } from "@/lib/security/requestKey";

const RATE_LIMIT = 60; // requests
const RATE_WINDOW_MS = 60_000; // per minute — generous for legitimate as-you-type usage

// Internal search-as-you-type endpoint for GeographySearchBox. Deliberately
// separate from /api/v1/search (gated by PUBLIC_API_V1_ENABLED, meant for
// external callers) so the internal UI's availability isn't coupled to the
// public API's own rollout — same reasoning already applied to
// /api/research/map-markers vs /api/v1/map-markers.
export async function GET(req: NextRequest) {
  if (!isWarehousePreviewEnabled() || !isMultiStateResearchEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const rate = checkRateLimit(`search-suggest:${clientIpKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } }
    );
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? undefined;
  const jurisdictionParam = searchParams.get("jurisdiction");
  const jurisdiction = jurisdictionParam === "NSW" || jurisdictionParam === "VIC" ? jurisdictionParam : undefined;
  const typeParam = searchParams.get("type");
  const geographyType = typeParam === "SAL" || typeParam === "POA" ? typeParam : undefined;
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 8;

  const results = await searchGeographiesV2({ query: q, jurisdiction, geographyType, limit });
  return NextResponse.json({ results, count: results.length });
}
