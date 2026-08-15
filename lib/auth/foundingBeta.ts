/**
 * V8 SA Founding Beta gate. "Bring Your Own Deal" is INVITE-ONLY: it is available
 * only when the feature flag is on AND the signed-in user's email is on the founding
 * cohort allowlist (managed out-of-band, like ADMIN_EMAILS). This is deliberately
 * env-driven so no user can self-grant access, and no schema/tier change is needed to
 * run the closed beta. The underlying data (RPC, buy box) still also requires
 * isWarehousePreviewEnabled(); callers check both.
 */
export function isFoundingBetaEnabled(): boolean {
  return process.env.BYOD_FOUNDING_BETA_ENABLED === "true";
}

function allowlist(): string[] {
  return (process.env.FOUNDING_BETA_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isFoundingBetaEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowlist().includes(email.toLowerCase());
}

/** The single gate the BYOD routes/pages use: flag on AND invited. */
export function foundingBetaGateOpen(email: string | null | undefined): boolean {
  return isFoundingBetaEnabled() && isFoundingBetaEmail(email);
}
