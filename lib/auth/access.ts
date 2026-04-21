import type { User } from "@supabase/supabase-js";

/**
 * When Supabase env is missing, treat the app as fully open so local development
 * keeps working. Once keys are set, full outputs require a signed-in user.
 */
export function hasFullToolAccess(
  user: User | null,
  authConfigured: boolean
): boolean {
  if (!authConfigured) return true;
  return user !== null;
}
