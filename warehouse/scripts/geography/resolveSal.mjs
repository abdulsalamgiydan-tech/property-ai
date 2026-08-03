/**
 * Deterministic suburb → canonical SAL resolver, built on the authoritative
 * warehouse geography spine (the ABS/ASGS dimension already in Production,
 * pulled read-only). Identity is (normalised name + state) — NEVER name alone.
 * Duplicate names within a state, or names absent from the spine, resolve to a
 * quarantine result with a specific reason; they never guess a SAL.
 */

export function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")       // drop "(NSW)" style disambiguators
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * @param {Array<{geography_id:string, geography_code:string, geography_name:string, state_code:string}>} spine
 * @param {string} stateCode  ASGS state code for the source jurisdiction (SA = "4")
 * @returns {(name:string)=>({matched:true, geographyId:string, geographyCode:string, canonicalName:string} | {matched:false, reason:string})}
 */
export function buildResolver(spine, stateCode) {
  const byName = new Map();
  for (const g of spine) {
    if (String(g.state_code) !== String(stateCode)) continue;
    const key = normalizeName(g.geography_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(g);
  }
  return (name) => {
    const key = normalizeName(name);
    if (!key) return { matched: false, reason: "empty_locality" };
    const hits = byName.get(key);
    if (!hits || hits.length === 0) return { matched: false, reason: "geography_unmatched" };
    if (hits.length > 1 && new Set(hits.map((h) => h.geography_id)).size > 1) return { matched: false, reason: "ambiguous_geography" };
    const g = hits[0];
    return { matched: true, geographyId: g.geography_id, geographyCode: g.geography_code, canonicalName: g.geography_name };
  };
}

/** Pulls the SAL spine for a state from the read-only warehouse REST API. */
export async function fetchSalSpine(env, stateCode) {
  const base = env.WAREHOUSE_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
  const H = { apikey: env.WAREHOUSE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.WAREHOUSE_SUPABASE_ANON_KEY}` };
  const url = `${base}/v_market_geography_search_v1?geography_type=eq.SAL&state_code=eq.${stateCode}&select=geography_id,geography_code,geography_name,state_code&limit=5000`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`spine fetch HTTP ${r.status}`);
  return r.json();
}
