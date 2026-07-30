/**
 * Sprint 17.5 -- safe, non-PII access-attempt logging for the admin
 * console's allowlist gate (app/admin/page.tsx). Logs only the outcome
 * and an internal user id, never the email (PII) or any other
 * identifying detail, so a rejected access attempt is visible in
 * server logs without leaking who was rejected.
 */
export function logAdminAccessDenied(user: { id: string } | null | undefined): void {
  console.warn("[admin] access denied: authenticated user is not on ADMIN_EMAILS allowlist", {
    hasUser: Boolean(user),
    userId: user?.id ?? null,
  });
}
