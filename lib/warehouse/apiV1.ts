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

export function apiV1Ok<T>(data: T, status = 200) {
  return NextResponse.json({ data, meta: { version: API_VERSION, generated_at: new Date().toISOString() } }, { status });
}

export function apiV1Error(message: string, status: number) {
  return NextResponse.json({ error: message, meta: { version: API_VERSION, generated_at: new Date().toISOString() } }, { status });
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
