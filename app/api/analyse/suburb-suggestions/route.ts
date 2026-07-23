import { NextRequest, NextResponse } from "next/server";
import { searchGeographiesV2, getMarketSnapshotV2 } from "@/lib/warehouse/queries";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { checkRateLimit } from "@/lib/security/rateLimiter";
import { clientIpKey } from "@/lib/security/requestKey";

const RATE_LIMIT = 30; // requests
const RATE_WINDOW_MS = 60_000; // per minute — a real user blurs this field rarely

/**
 * Server-side resolution of "suburb-based suggestions" for the Analyse a
 * Property tool (Sprint 13 WS5). Deliberately internal, not part of
 * /api/v1 — this is app-internal context, not a public data surface.
 * Gated by WAREHOUSE_PREVIEW_ENABLED, the same flag as the rest of the
 * research UI this data comes from.
 *
 * Only ever returns real, sourced values, never invented ones: gross
 * yield/growth figures come straight off the suburb's market snapshot;
 * there is no vacancy-rate mart anywhere in the warehouse, so vacancy is
 * always omitted rather than guessed.
 */
export async function GET(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) {
    return NextResponse.json({ available: false, reason: "feature_disabled" }, { status: 404 });
  }

  const rate = checkRateLimit(`suburb-suggestions:${clientIpKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { available: false, reason: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } }
    );
  }

  const { searchParams } = req.nextUrl;
  const suburb = searchParams.get("suburb")?.trim();
  const stateParam = searchParams.get("state")?.trim().toUpperCase();

  if (!suburb) {
    return NextResponse.json({ available: false, reason: "no_match" }, { status: 400 });
  }

  // The warehouse currently only has NSW/VIC suburb-level sales+rent
  // coverage — see warehouse/config/jurisdiction_coverage.yml. Every
  // other state must return a clear, honest "not covered" rather than
  // silently doing nothing.
  if (stateParam !== "NSW" && stateParam !== "VIC") {
    return NextResponse.json({ available: false, reason: "state_not_covered" });
  }

  const matches = await searchGeographiesV2({
    query: suburb,
    jurisdiction: stateParam,
    geographyType: "SAL",
    limit: 1,
  });
  const match = matches[0];
  if (!match) {
    return NextResponse.json({ available: false, reason: "no_match" });
  }

  const snapshot = await getMarketSnapshotV2(match.geography_id);
  if (!snapshot) {
    return NextResponse.json({ available: false, reason: "insufficient_data" });
  }

  return NextResponse.json({
    available: true,
    geographyId: match.geography_id,
    geographyCode: match.geography_code,
    geographyName: match.geography_name,
    suggestions: {
      // Recent 12-month price change — labelled as a historical figure by
      // the client, never presented as a forward growth-rate forecast.
      suburbGrowthPercent: snapshot.annual_price_change_pct,
      rentalGrowthPercent: snapshot.annual_rent_change_pct,
      // No vacancy-rate source exists anywhere in the warehouse (see
      // jurisdiction_coverage.yml — "vacancy: unavailable" for every
      // jurisdiction) — always omit rather than fabricate.
      vacancyPercent: null,
    },
    medianSalePrice12m: snapshot.median_sale_price_12m,
    medianWeeklyRentLatest: snapshot.median_weekly_rent_latest,
  });
}
