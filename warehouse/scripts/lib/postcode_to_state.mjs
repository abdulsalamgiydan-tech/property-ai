// Official Australia Post postcode ranges, used wherever a POA-grain fact
// needs jurisdiction attribution — core.dim_geography.state_code is NULL
// for every POA row (POA is not a single-state geography in ASGS), so this
// heuristic is the only way to attribute postcode-grain data to a state.
// First introduced in Sprint 12 WS1's national coverage audit; extracted
// here (WS6) so it has exactly one implementation instead of being copied.
export function postcodeToState(poa) {
  const n = parseInt(poa, 10);
  if (!Number.isFinite(n)) return null;
  if (n >= 200 && n <= 299) return "8"; // ACT
  if (n >= 2600 && n <= 2618) return "8"; // ACT
  if (n >= 2900 && n <= 2920) return "8"; // ACT
  if (n >= 1000 && n <= 1999) return "1"; // NSW (LVR range)
  if (n >= 2000 && n <= 2599) return "1"; // NSW
  if (n >= 2619 && n <= 2899) return "1"; // NSW
  if (n >= 2921 && n <= 2999) return "1"; // NSW
  if (n >= 3000 && n <= 3999) return "2"; // VIC
  if (n >= 8000 && n <= 8999) return "2"; // VIC (LVR range)
  if (n >= 4000 && n <= 4999) return "3"; // QLD
  if (n >= 9000 && n <= 9999) return "3"; // QLD (LVR range)
  if (n >= 5000 && n <= 5999) return "4"; // SA
  if (n >= 6000 && n <= 6999) return "5"; // WA
  if (n >= 7000 && n <= 7999) return "6"; // TAS
  if (n >= 800 && n <= 999) return "7"; // NT
  return null;
}
