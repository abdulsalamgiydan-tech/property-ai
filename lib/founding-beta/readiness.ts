type FoundingBetaEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  "WAREHOUSE_PREVIEW_ENABLED" | "BYOD_FOUNDING_BETA_ENABLED" | "FOUNDING_BETA_EMAILS"
>>;

export type FoundingBetaGateState = "dark" | "invited_cohort_active";

export interface FoundingBetaReadiness {
  gateState: FoundingBetaGateState;
  warehouseSurfaceEnabled: boolean;
  foundingBetaEnabled: boolean;
  cohortConfigured: boolean;
  invitedIdentityCount: number;
  activationRequirements: string[];
}

function validCohortSize(raw: string | undefined): number {
  const identities = (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  return new Set(identities).size;
}

/**
 * Produces an admin-safe founding-beta status summary. It intentionally returns
 * only booleans and a count: raw allowlist identities and environment values
 * must never be rendered or logged.
 */
export function getFoundingBetaReadiness(
  env: FoundingBetaEnvironment = process.env as FoundingBetaEnvironment,
): FoundingBetaReadiness {
  const warehouseSurfaceEnabled = env.WAREHOUSE_PREVIEW_ENABLED === "true";
  const foundingBetaEnabled = env.BYOD_FOUNDING_BETA_ENABLED === "true";
  const invitedIdentityCount = validCohortSize(env.FOUNDING_BETA_EMAILS);
  const cohortConfigured = invitedIdentityCount > 0;
  const invitedCohortActive = warehouseSurfaceEnabled && foundingBetaEnabled && cohortConfigured;

  const activationRequirements: string[] = [];
  if (!warehouseSurfaceEnabled) activationRequirements.push("Enable the warehouse surface in the approved release environment.");
  if (!foundingBetaEnabled) activationRequirements.push("Enable the founding-beta flag only after launch approval.");
  if (!cohortConfigured) activationRequirements.push("Add the approved invited cohort through the controlled environment workflow.");

  return {
    gateState: invitedCohortActive ? "invited_cohort_active" : "dark",
    warehouseSurfaceEnabled,
    foundingBetaEnabled,
    cohortConfigured,
    invitedIdentityCount,
    activationRequirements,
  };
}
