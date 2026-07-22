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

// Sprint 11 WS18 — gates /research/data-status independently of the general
// WAREHOUSE_PREVIEW_ENABLED gate, since it exposes operational detail
// (refresh history, storage consumption) that a reviewer may want to
// preview separately from the research content itself. Both flags are
// checked by the page (defence in depth, same pattern as
// MULTI_STATE_RESEARCH_ENABLED alongside WAREHOUSE_PREVIEW_ENABLED).
export function isDataOperationsEnabled(): boolean {
  return process.env.DATA_OPERATIONS_ENABLED === "true";
}

// Sprint 11 WS18 — gates the National Property Scenario Lab (/research/scenario,
// built in Sprint 12 Part C). Added ahead of the route's existence so
// staging/preview config can be prepared without a later mid-sprint env
// var addition. Unused until the route exists; defaults to disabled.
export function isScenarioLabEnabled(): boolean {
  return process.env.SCENARIO_LAB_ENABLED === "true";
}
