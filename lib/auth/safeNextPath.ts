/**
 * Restrict post-auth redirects to same-origin paths (no open redirects).
 */
export function safeInternalNextPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  let decoded = raw.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return "/";
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/";
  const lower = decoded.toLowerCase();
  if (lower.startsWith("/http") || lower.startsWith("/\\")) return "/";
  return decoded;
}
