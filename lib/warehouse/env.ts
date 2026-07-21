export function isWarehousePreviewEnabled(): boolean {
  return process.env.WAREHOUSE_PREVIEW_ENABLED === "true";
}

// Sprint 10 — gates the multi-state (NSW + VIC) explore/compare routes and
// the new v2 query functions. Disabled by default, independent of
// WAREHOUSE_PREVIEW_ENABLED (both must be true for the new routes — see
// app/research/explore and app/research/compare layouts).
export function isMultiStateResearchEnabled(): boolean {
  return process.env.MULTI_STATE_RESEARCH_ENABLED === "true";
}

export function isWarehouseConfigured(): boolean {
  const url = process.env.WAREHOUSE_SUPABASE_URL;
  const key = process.env.WAREHOUSE_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}
