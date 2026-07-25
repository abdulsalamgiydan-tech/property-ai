import { NextResponse } from "next/server";
import { isPublicApiV1Enabled, isWarehouseConfigured } from "./env";
import { checkRateLimit } from "@/lib/security/rateLimiter";

const API_VERSION = "v1";
const API_LIMIT = 120;
const API_WINDOW_MS = 60_000;

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Request-Id",
};

export function apiV1RequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function meta(requestId = apiV1RequestId()) {
  return { version: API_VERSION, generated_at: new Date().toISOString(), request_id: requestId };
}

export function apiV1Ok<T>(data: T, status = 200, requestId?: string) {
  const id = requestId ?? apiV1RequestId();
  return NextResponse.json({ data, meta: meta(id) }, { status, headers: { ...CORS_HEADERS, "X-Request-Id": id } });
}

export function apiV1Error(message: string, status: number, requestId?: string) {
  const id = requestId ?? apiV1RequestId();
  return NextResponse.json({ error: message, meta: meta(id) }, { status, headers: { ...CORS_HEADERS, "X-Request-Id": id } });
}

export function apiV1GateOrNotFound(key = "anonymous") {
  if (!isPublicApiV1Enabled() || !isWarehouseConfigured()) {
    return apiV1Error("not found", 404);
  }
  const limit = checkRateLimit(`api-v1:${key}`, API_LIMIT, API_WINDOW_MS);
  if (!limit.allowed) {
    return apiV1Error("rate limit exceeded", 429);
  }
  return null;
}
