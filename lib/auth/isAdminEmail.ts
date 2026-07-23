/**
 * Sprint 14 WS20 — admin allowlist check. Pure function, no I/O, so
 * it's directly testable without mocking Supabase or env vars in a
 * live server context.
 *
 * `adminEmailsEnv` should be `process.env.ADMIN_EMAILS` at the call
 * site — passed as a parameter (not read internally) so this stays a
 * pure function. Comma-separated, case-insensitive, trimmed. An empty
 * or unset allowlist means nobody is an admin — the safe default.
 */
export function isAdminEmail(email: string | null | undefined, adminEmailsEnv: string | null | undefined): boolean {
  if (!email) return false;
  const list = (adminEmailsEnv ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}
