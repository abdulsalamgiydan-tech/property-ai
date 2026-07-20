export function isWarehousePreviewEnabled(): boolean {
  return process.env.WAREHOUSE_PREVIEW_ENABLED === "true";
}

export function isWarehouseConfigured(): boolean {
  const url = process.env.WAREHOUSE_SUPABASE_URL;
  const key = process.env.WAREHOUSE_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}
