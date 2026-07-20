import { createClient } from "@supabase/supabase-js";
import { isWarehouseConfigured } from "./env";

/**
 * Server-only client for the warehouse-validation branch's public read-only
 * API (see warehouse/docs/WAREHOUSE_READONLY_ACCESS_DESIGN.md). Uses the
 * branch's anon key — never a service-role key. IMPORTANT: only import this
 * from Server Components / route handlers, never from a "use client" file —
 * this repo has no `server-only` package guard, so this is enforced by
 * convention (see the /research routes for the intended usage pattern).
 * This is intentionally a SEPARATE client from lib/supabase/{client,server}.ts,
 * which point at the production project — the two must never be conflated.
 */
export function createWarehouseClient() {
  if (!isWarehouseConfigured()) return null;
  return createClient(process.env.WAREHOUSE_SUPABASE_URL!, process.env.WAREHOUSE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}
