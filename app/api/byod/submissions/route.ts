import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { foundingBetaDeniedResponse, requireFoundingBetaAccess } from "@/lib/auth/foundingBetaAccess";
import { serverErrorResponse } from "@/lib/api/safeError";
import { byodListingSchema } from "@/lib/byod/schema";

/**
 * V8 Bring Your Own Deal — persist / list a user's saved BYOD submissions.
 * INVITE-ONLY + flag-gated. RLS scopes every row to its owner. The pasted source URL
 * is stored as reference-only provenance (never fetched). Fail-closed: an operation
 * affecting zero rows returns 404, never a misleading {ok:true}.
 */
async function gate() {
  return requireFoundingBetaAccess();
}

export async function GET() {
  const g = await gate();
  if (!g.ok) return foundingBetaDeniedResponse(g);
  const { data, error } = await g.supabase
    .from("byod_submissions")
    .select("id, address_full, suburb, state, geography_id, property_type, bedrooms, bathrooms, parking, land_area_sqm, price_display, price_lower, price_upper, listing_status, source_url, source_captured_at, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) return serverErrorResponse();
  return NextResponse.json({ submissions: data ?? [] });
}

const saveSchema = z.object({ listing: byodListingSchema });

export async function POST(req: NextRequest) {
  const g = await gate();
  if (!g.ok) return foundingBetaDeniedResponse(g);
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const l = parsed.data.listing;
  const { data, error } = await g.supabase
    .from("byod_submissions")
    .insert({
      user_id: g.user.id,
      source_url: l.sourceUrl ?? null,
      source_captured_at: l.sourceCapturedAt ?? new Date().toISOString(),
      address_full: l.address.full,
      suburb: l.address.suburb,
      state: l.address.state,
      postcode: l.address.postcode ?? null,
      geography_id: l.geographyId,
      property_type: l.propertyType,
      bedrooms: l.bedrooms ?? null,
      bathrooms: l.bathrooms ?? null,
      parking: l.parking ?? null,
      land_area_sqm: l.landAreaSqm ?? null,
      price_display: l.priceDisplay,
      price_lower: l.price ?? null,
      price_upper: l.priceUpper ?? null,
      listing_status: l.listingStatus,
    })
    .select("id")
    .single();
  if (error || !data) return serverErrorResponse();
  return NextResponse.json({ ok: true, id: data.id, listingKey: `user-entered:${data.id}` });
}
