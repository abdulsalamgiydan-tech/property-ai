// ASGS numeric state/territory codes, as stored on core.dim_geography.
const ASGS_STATE_NAMES: Record<string, string> = {
  "1": "NSW",
  "2": "VIC",
  "3": "QLD",
  "4": "SA",
  "5": "WA",
  "6": "TAS",
  "7": "NT",
  "8": "ACT",
  "9": "Other",
};

export function stateLabel(stateCode: string | null | undefined): string | null {
  if (!stateCode) return null;
  return ASGS_STATE_NAMES[stateCode] ?? stateCode;
}
