import type { StashLocality } from "./schemas";

/**
 * The canonical Propellect identity for a suburb, used to resolve the matching
 * Stash locality. Matching requires suburb AND state AND postcode to agree —
 * NEVER suburb name alone — because duplicate suburb names across states
 * (e.g. "Richmond" in NSW and VIC) and postcode splits make name-only matching
 * unsafe. The Propellect canonical geography_id is retained so a resolved match
 * can be recorded against it.
 */
export type PropellectLocalityIdentity = {
  geographyId: string;
  suburb: string;
  state: string;
  postcode: string;
};

export type LocalityMatchResult =
  | { matched: true; locality: StashLocality; geographyId: string }
  | { matched: false; reason: string };

function normSuburb(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "") // drop disambiguation suffix e.g. "Abbotsford (NSW)"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normState(s: string): string {
  return s.trim().toUpperCase();
}

function normPostcode(s: string): string {
  return s.trim();
}

/**
 * Resolves the Stash locality for a Propellect identity. Returns matched:false
 * (with a specific reason) rather than guessing whenever identity is incomplete,
 * nothing matches on all three keys, or the match is ambiguous — the caller must
 * then treat the metric as Stash-unavailable, never silently pick a wrong suburb.
 */
export function matchStashLocality(
  identity: PropellectLocalityIdentity,
  candidates: StashLocality[]
): LocalityMatchResult {
  if (!identity.suburb?.trim() || !identity.state?.trim() || !identity.postcode?.trim()) {
    return { matched: false, reason: "incomplete identity: suburb, state and postcode are all required" };
  }
  const wantSuburb = normSuburb(identity.suburb);
  const wantState = normState(identity.state);
  const wantPostcode = normPostcode(identity.postcode);

  const full = candidates.filter(
    (c) => normSuburb(c.suburb) === wantSuburb && normState(c.state) === wantState && normPostcode(c.postcode) === wantPostcode
  );
  if (full.length === 1) return { matched: true, locality: full[0], geographyId: identity.geographyId };
  if (full.length > 1) {
    // Same suburb+state+postcode appearing more than once — ambiguous, do not guess.
    if (new Set(full.map((c) => c.locality_id)).size === 1) {
      return { matched: true, locality: full[0], geographyId: identity.geographyId };
    }
    return { matched: false, reason: `ambiguous: ${full.length} Stash localities share this suburb/state/postcode` };
  }

  // Diagnose the near-miss so the reason is specific, never "not found".
  const nameOnly = candidates.filter((c) => normSuburb(c.suburb) === wantSuburb);
  if (nameOnly.length === 0) return { matched: false, reason: "no Stash locality with this suburb name" };
  const stateMismatch = nameOnly.every((c) => normState(c.state) !== wantState);
  if (stateMismatch) return { matched: false, reason: "suburb name matched but state differs — refusing name-only match" };
  return { matched: false, reason: "suburb and state matched but postcode differs — refusing to mix postcodes" };
}
