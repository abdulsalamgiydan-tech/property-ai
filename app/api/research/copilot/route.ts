import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isResearchCopilotEnabled, isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { getMarketSnapshotV2, resolveGeographyByCode } from "@/lib/warehouse/queries";
import { stateLabel } from "@/lib/warehouse/stateCode";
import { buildEvidencePack, formatEvidenceForPrompt } from "@/lib/research/copilotEvidence";
import { checkAnswerGrounding } from "@/lib/research/copilotGrounding";
import { answerResearchQuestion } from "@/lib/research/copilotClient";
import { countRecentQueries, recordQuery, COPILOT_FREE_TIER_LIMIT } from "@/lib/research/copilotRateLimit";
import { sanitiseUserText } from "@/lib/strategy/sanitiseUserText";
import { checkRateLimit } from "@/lib/security/rateLimiter";

// In-memory, per-instance defense-in-depth on top of the DB-backed daily
// limit (which requires migration 042 to be applied) — same pattern as
// app/api/watchlist/refresh-changes/route.ts.
const INSTANCE_RATE_LIMIT = 3;
const INSTANCE_RATE_WINDOW_MS = 60_000;

/**
 * Evidence is ALWAYS re-fetched server-side from geographyCode, never
 * accepted from the request body. If a client could supply its own
 * "evidence", the grounding check would be trivially bypassable — a
 * caller could claim any number is "evidence" and get the model to
 * restate it as if verified.
 */
export async function POST(req: Request) {
  if (!isWarehousePreviewEnabled() || !isResearchCopilotEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const instanceLimit = checkRateLimit(`copilot:${user.id}`, INSTANCE_RATE_LIMIT, INSTANCE_RATE_WINDOW_MS);
  if (!instanceLimit.allowed) {
    return NextResponse.json({ error: "rate_limit", retry_after_ms: instanceLimit.retryAfterMs }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { geographyCode, question: rawQuestion } = (body ?? {}) as { geographyCode?: unknown; question?: unknown };
  if (typeof geographyCode !== "string" || !geographyCode.trim()) {
    return NextResponse.json({ error: "validation_error", message: "geographyCode is required" }, { status: 400 });
  }
  if (typeof rawQuestion !== "string" || !rawQuestion.trim()) {
    return NextResponse.json({ error: "validation_error", message: "question is required" }, { status: 400 });
  }

  const dailyCount = await countRecentQueries(user.id, supabase);
  if (dailyCount != null && dailyCount >= COPILOT_FREE_TIER_LIMIT) {
    return NextResponse.json({ error: "rate_limit", scope: "daily" }, { status: 429 });
  }

  const geo = await resolveGeographyByCode("SAL", geographyCode);
  if (!geo) {
    return NextResponse.json({ error: "not_found", message: "Unknown geography" }, { status: 404 });
  }

  const snapshot = await getMarketSnapshotV2(geo.geography_id);
  if (!snapshot) {
    return NextResponse.json({ error: "no_data", message: "No market snapshot available for this area" }, { status: 404 });
  }

  const geographyLabel = `${geo.geography_name}${stateLabel(geo.state_code) ? `, ${stateLabel(geo.state_code)}` : ""}`;
  const facts = buildEvidencePack({
    geographyLabel,
    medianSalePrice12m: snapshot.median_sale_price_12m,
    salesConfidence: snapshot.sales_sample_confidence,
    latestSalesPeriod: snapshot.latest_sales_period,
    medianWeeklyRent: snapshot.median_weekly_rent_latest,
    rentConfidence: snapshot.rent_confidence,
    latestRentPeriod: snapshot.latest_rent_period,
    grossYieldPct: snapshot.gross_yield_pct,
    yieldConfidence: snapshot.yield_confidence,
    dwellingStockTotal: snapshot.dwelling_stock_total,
    approvals12m: snapshot.approvals_12m,
    totalPopulation: snapshot.total_population,
    medianWeeklyHouseholdIncome: snapshot.median_weekly_household_income,
    priceToIncomeRatio: snapshot.price_to_income_ratio,
    affordabilityConfidence: snapshot.affordability_confidence,
  });

  const { cleaned: question } = sanitiseUserText(rawQuestion);
  if (!question) {
    return NextResponse.json({ error: "validation_error", message: "question is empty after sanitisation" }, { status: 400 });
  }

  let answerText: string;
  try {
    const result = await answerResearchQuestion(formatEvidenceForPrompt(facts), question);
    answerText = result.answerText;
  } catch (e) {
    console.error("[research/copilot] generation failed");
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }

  const grounding = checkAnswerGrounding(answerText, facts);

  try {
    await recordQuery(user.id, geo.geography_id, question, grounding.grounded, supabase);
  } catch (e) {
    // Non-fatal: the answer was already generated and passed its
    // grounding check; losing the audit-log row must not fail the request.
    console.error("[research/copilot] failed to record query:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    answerText,
    grounded: grounding.grounded,
    ungroundedClaims: grounding.ungroundedClaims,
    evidence: facts,
    geographyLabel,
  });
}
