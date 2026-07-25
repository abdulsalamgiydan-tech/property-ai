import { NextResponse } from "next/server";
import { isPublicApiV1Enabled, isWarehouseConfigured } from "./env";

/**
 * Shared response envelope and gate for every /api/v1/* route handler
 * (Sprint 12 WS11). One consistent shape across the whole versioned
 * surface: { data, meta: { version, generated_at } } on success,
 * { error, meta } on failure — so a caller never needs route-specific
 * parsing logic to tell success from failure.
 */

const API_VERSION = "v1";

// Sprint 12 WS14 — /api/v1 is documented (PUBLIC_API_V1_CONTRACT.md) as
// possibly serving external callers, not just this app's own UI, but
// carried no CORS headers -- a browser-based cross-origin caller would
// have been silently blocked by the browser's own CORS enforcement
// (server-to-server callers, e.g. curl or a backend service, are
// unaffected either way, since CORS is a browser-side restriction).
// Every endpoint here is read-only (GET only), unauthenticated, and
// serves the same anon-key-gated public research data a browser could
// already read directly via the Supabase REST API with the same anon
// key -- a permissive origin is the correct, standard choice for this
// class of public read-only API, matching common open-data API practice.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function apiV1Ok<T>(data: T, status = 200) {
  return NextResponse.json({ data, meta: { version: API_VERSION, generated_at: new Date().toISOString() } }, { status, headers: CORS_HEADERS });
}

export function apiV1Error(message: string, status: number) {
  return NextResponse.json({ error: message, meta: { version: API_VERSION, generated_at: new Date().toISOString() } }, { status, headers: CORS_HEADERS });
}

/**
 * Returns a 404 response if the route should not be reachable at all
 * (feature-flagged off), or null if the caller should proceed. 404 (not
 * 403) is deliberate — matches the existing /api/research/map-markers
 * convention of not revealing that a gated route exists at all.
 */
export function apiV1GateOrNotFound() {
  if (!isPublicApiV1Enabled() || !isWarehouseConfigured()) {
    return apiV1Error("not found", 404);
  }
  return null;
}
